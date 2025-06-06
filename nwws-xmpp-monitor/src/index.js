import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises'; // Added for readFile
import pino from 'pino';

// Determine the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Construct the path to the .env file (assuming it's in the parent directory of src)
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

// Initialize Pino logger conditionally
let logger;
const logTarget = process.env.LOG_TARGET || 'file'; // Default to file logging

if (logTarget === 'stdout') {
    logger = pino({
        level: process.env.LOG_LEVEL || 'info', // Default to 'info', can be overridden
        // Pino defaults to 'info' level, and NODE_ENV=production also suggests 'info'.
        // Add any other pino options for stdout logging here if needed.
    });
    logger.info('Logger initialized to write to STDOUT.');
} else { // 'file' or any other value defaults to file logging with pino-roll
    const logsDir = path.join(__dirname, '..', 'logs');
    const transport = pino.transport({
        target: 'pino-roll',
        options: {
            file: path.join(logsDir, 'app.log'),
            frequency: 'daily',
            size: '20m',
            limit: { count: 7 },
            mkdir: true,
            symlink: path.join(logsDir, 'current.log') // Ensure symlink is also in logsDir
        }
    });
    logger = pino(transport);
    logger.info(`Logger initialized to write to file (pino-roll). LOG_TARGET=${logTarget}. Log path: ${path.join(logsDir, 'app.log')}`);
}

logger.info('Attempting to load .env from:', envPath);
logger.info('XMPP_SERVER in index.js after dotenv.config():', process.env.XMPP_SERVER);
logger.info('XMPP_USER in index.js after dotenv.config():', process.env.XMPP_USER);

import { XMPPClient } from './xmpp/client.js';
import { categorizeMessage } from './categorizer/index.js';
import { parseAlert } from './parsers/alertParser.js';
import { parseStormReport } from './parsers/stormReportParser.js';
import { StormReportImageGeneratorService } from './stormReportImageGeneratorService.js';
import { ImageGeneratorService as AlertImageGeneratorService } from './imageGeneratorService.js';
import { sendToWebhook } from './webhook/sender.js';

import definitions from './parsers/parser_config.js';

// Instantiate services
const stormReportImageService = new StormReportImageGeneratorService();
const alertImageService = new AlertImageGeneratorService();

// Define the message handling function
const handleIncomingMessage = async ({ rawText, id, stanza }) => {
    logger.info('Index.js: Received raw message for processing:', rawText ? rawText.substring(0, 100) + "..." : "undefined", 'ID:', id);

    // The `stanza` object from @xmpp/client is an instance of an XML Element.
    // We can pass it to the categorizer and parsers.
    const categoryResult = await categorizeMessage(rawText, id, stanza);
    let parsedData;
    let capAlertElementForParser = null;

    // If the categorizer returns an object with category and the CAP element
    let category;
    if (typeof categoryResult === 'object' && categoryResult.category) {
        category = categoryResult.category;
        capAlertElementForParser = categoryResult.capAlertElement;
    } else {
        category = categoryResult; // Older string-only return
    }

    if (category === 'alert') {
        // Pass the rawText, id, and the found capAlertElement to the parser
        parsedData = parseAlert(rawText, id, capAlertElementForParser, logger);

        // If parseAlert returned null (e.g., for Cancel/Update messages, or other parse failures), stop processing
        if (!parsedData) {
            // alertParser.js should have already logged the reason for returning null (if it's a Cancel/Update)
            return;
        }

        // UGC Filtering Logic for 'alert' category
        if (definitions.allowed_ugc_codes && definitions.allowed_ugc_codes.length > 0) {
            if (!definitions.shouldProcessUgc(parsedData.ugc)) { // parsedData.ugc should exist for alerts
                const messageUgcZonesText = parsedData.ugc && parsedData.ugc.zones && parsedData.ugc.zones.length > 0 ? parsedData.ugc.zones.join(', ') : 'none';
                logger.info(`Index.js: Message ID ${id} (Alert) filtered out by UGC. Alert Zones: [${messageUgcZonesText}]. Allowed Config Zones: [${definitions.allowed_ugc_codes.join(', ')}]. Not processing further.`);
                return; // Stop processing this alert
            }
            const messageUgcZonesText = parsedData.ugc && parsedData.ugc.zones && parsedData.ugc.zones.length > 0 ? parsedData.ugc.zones.join(', ') : 'none';
            logger.info(`Index.js: Message ID ${id} (Alert) matched UGC filter. Alert Zones: [${messageUgcZonesText}]. Proceeding with event name check.`);
        } else {
            logger.info(`Index.js: No UGC codes defined in parser_config.allowed_ugc_codes or list is empty. Skipping UGC filtering for alert ID ${id}.`);
        }
        // End of UGC Filtering Logic for 'alert' category
        
        if (parsedData && parsedData.event) {  
            logger.info(`Raw event name: "${parsedData.event}"`);
            logger.info(`Allowlist: ${JSON.stringify(definitions.allowed_events)}`);
            
            const eventName = parsedData.event.toLowerCase();
            const allowedEvents = definitions.allowed_events.map(e => e.toLowerCase());
            
            logger.info(`Normalized event: "${eventName}"`);
            logger.info(`Normalized allowlist: ${JSON.stringify(allowedEvents)}`);
            
            if (!allowedEvents.includes(eventName)) {
                logger.info(`Event "${parsedData.event}" is not allowed. Skipping.`);
                return;
            } else {
                logger.info(`Processing allowed event: ${parsedData.event}`);
            }
        }
        
        parsedData.messageType = 'alert'; // Add messageType for alerts
        try {
            // Sanitize ID for use in filename
            const sanitizedId = id.replace(/[^a-zA-Z0-9_.-]/g, '_');
            // Note: alertImageService.generateImage internally creates a filename based on warningData.id
            // It returns the full path to the image.
            const imagePath = await alertImageService.generateImage(parsedData);
            
            if (imagePath) {
                logger.info(`Index.js: Image generated for alert ${id} at ${imagePath}`);
                try {
                    const imageBuffer = await fs.readFile(imagePath);
                    parsedData.imageBuffer = imageBuffer;
                    parsedData.imageFileName = path.basename(imagePath); // Extract filename from path
                    parsedData.imagePath = imagePath; // Store full image path
                } catch (readError) {
                    logger.error(`Index.js: Error reading image file ${imagePath} for alert ${id}:`, readError.message);
                }
            } else {
                logger.info(`Index.js: Image generation failed or returned no path for alert ${id}. Skipping webhook.`);
                return; // Skip sending webhook if no image is generated
            }
        } catch (genError) {
            logger.error(`Index.js: Error during image generation for alert ${id}:`, genError.message ? genError.message : genError);
            return; // Skip sending webhook if image generation fails
        }
    } else if (category === 'storm_report') {
        parsedData = parseStormReport(rawText, id, logger); // Pass logger
        if (parsedData) {
            // Filter out LSRs with summary "Rain"
            if (parsedData.summary === 'Rain') {
                logger.info(`Index.js: Skipping Local Storm Report ID ${id} because summary is 'Rain'.`);
                return;
            }

            // LSR Issuing Office Filtering
            if (definitions.allowed_lsr_issuing_offices && definitions.allowed_lsr_issuing_offices.length > 0) {
                if (!definitions.shouldProcessLsrByOffice(parsedData.issuingOffice)) {
                    logger.info(`Index.js: Message ID ${id} (Storm Report) filtered out by Issuing Office. Office: [${parsedData.issuingOffice || 'N/A'}]. Allowed Offices: [${definitions.allowed_lsr_issuing_offices.join(', ')}]. Not processing further.`);
                    return; // Stop processing this storm report
                }
                logger.info(`Index.js: Message ID ${id} (Storm Report) matched Issuing Office filter. Office: [${parsedData.issuingOffice}]. Proceeding.`);
            } else {
                logger.info(`Index.js: No LSR Issuing Offices defined in parser_config.allowed_lsr_issuing_offices or list is empty. Skipping office filtering for storm report ID ${id}.`);
            }
            // End of LSR Issuing Office Filtering
            parsedData.messageType = 'storm_report'; // Add messageType for storm reports
            try {
                // Sanitize ID for use in filename (replace non-alphanumeric characters except ., _, -)
                const sanitizedId = id.replace(/[^a-zA-Z0-9_.-]/g, '_');
                const stormReportImageFileName = `storm_report_${sanitizedId}_${Date.now()}.png`;
                logger.info(`Index.js: Attempting to generate image for storm report ${id} with filename ${stormReportImageFileName}`);
                
                const imagePath = await stormReportImageService.generateMapImage(parsedData, stormReportImageFileName);
                
                if (imagePath) {
                    logger.info(`Index.js: Image generated for storm report ${id} at ${imagePath}`);
                    try {
                        const imageBuffer = await fs.readFile(imagePath);
                        parsedData.imageBuffer = imageBuffer; 
                        parsedData.imageFileName = stormReportImageFileName; 
                        parsedData.imagePath = imagePath; 
                    } catch (readError) {
                        logger.error(`Index.js: Error reading image file ${imagePath} for storm report ${id}:`, readError.message);
                    }
                } else {
                    logger.info(`Index.js: Image generation failed or returned no path for storm report ${id}. Skipping webhook.`);
                    return; // Skip sending webhook if no image is generated
                }
            } catch (genError) {
                logger.error(`Index.js: Error during image generation for storm report ${id}:`, genError.message ? genError.message : genError);
                return; // Skip sending webhook if image generation fails
            }
        }
    } else {
        logger.info('Index.js: Unknown message category:', category);
        return; // Return early if category is unknown
    }

    if (parsedData) {
        const webhookUrl = process.env.WEBHOOK_URL;
        if (!webhookUrl) {
            logger.error("WEBHOOK_URL is not defined in .env file. Cannot send data.");
            return;
        }

        const { imageBuffer, imageFileName, imagePath: localImagePath, ...dataToSend } = parsedData;

        if (imageBuffer && imageFileName) {
            sendToWebhook(webhookUrl, dataToSend, imageBuffer, imageFileName)
                .then(() => {
                    logger.info('Index.js: Successfully sent multipart data to webhook for ID:', id);
                    if (localImagePath) { 
                        fs.unlink(localImagePath)
                            .then(() => logger.info(`Index.js: Successfully deleted image ${localImagePath}`))
                            .catch(err => logger.error(`Index.js: Error deleting image ${localImagePath}:`, err.message));
                    }
                })
                .catch(error => logger.error('Index.js: Error sending multipart data to webhook for ID:', id, error.message ? error.message : error));
        } else {
            logger.info('Index.js: No image generated or read. Skipping webhook.');
            return; 
        }
    } else {
        logger.info('Index.js: No parsed data to send for ID:', id);
    }
};

logger.info('Instantiating XMPPClient...');
const xmppClientInstance = new XMPPClient(handleIncomingMessage, logger); // Pass logger to XMPPClient if it supports/needs it
logger.info('XMPPClient instance created:', xmppClientInstance ? 'OK' : 'Failed');
logger.info('typeof xmppClientInstance.connect:', typeof xmppClientInstance?.connect);

logger.info('Calling xmppClientInstance.connect()...');
const connectPromise = xmppClientInstance.connect();

if (connectPromise && typeof connectPromise.then === 'function') {
    connectPromise.then(() => {
        logger.info('Index.js: XMPP client connect() promise resolved. Connection process likely successful or ongoing (check XMPPClient logs).');
    })
        .catch(error => {
            logger.error('Index.js: Failed to connect XMPP client (connect() promise rejected):', error.message ? error.message : error);
        });
} else {
    logger.error('FATAL: xmppClientInstance.connect() did not return a Promise. Check XMPPClient implementation.');
    process.exit(1);
}

async function shutdown() {
    logger.info('Initiating graceful shutdown...');
    if (xmppClientInstance) {
        await xmppClientInstance.disconnect();
    }
    logger.info('Shutdown complete.');
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ...existing code...
    // Filter by UGC if configured
    if (definitions.allowed_ugc_codes && definitions.allowed_ugc_codes.length > 0) {
      console.log(`[index.js] UGC filtering is active. Checking product with UGC: ${JSON.stringify(parsedProduct.ugc, null, 2)}`);
      if (!definitions.shouldProcessUgc(parsedProduct.ugc)) {
        logger.debug(`Product ${parsedProduct.vtec_string || 'UNKNOWN'} filtered out by UGC.`);
        console.log(`[index.js] Product ${parsedProduct.vtec_string || 'UNKNOWN'} filtered out by UGC.`);
        return; // Skip this product
      }
      console.log(`[index.js] Product ${parsedProduct.vtec_string || 'UNKNOWN'} PASSED UGC filter.`);
    } else {
      console.log('[index.js] UGC filtering is NOT active (allowed_ugc_codes is empty or not defined).');
    }

    // Filter by LSR Issuing Office if configured
    if (definitions.allowed_lsr_issuing_offices && definitions.allowed_lsr_issuing_offices.length > 0) {
      console.log(`[index.js] LSR Issuing Office filtering is active. Checking office: ${parsedProduct.issuingOffice}`);
      if (!definitions.shouldProcessLsrByOffice(parsedProduct.issuingOffice)) {
        logger.debug(`Product ${parsedProduct.vtec_string || 'UNKNOWN'} filtered out by LSR Issuing Office.`);
        console.log(`[index.js] Product ${parsedProduct.vtec_string || 'UNKNOWN'} filtered out by LSR Issuing Office.`);
        return; // Skip this product
      }
      console.log(`[index.js] Product ${parsedProduct.vtec_string || 'UNKNOWN'} PASSED LSR Issuing Office filter.`);
    } else {
      console.log('[index.js] LSR Issuing Office filtering is NOT active (allowed_lsr_issuing_offices is empty or not defined).');
    }