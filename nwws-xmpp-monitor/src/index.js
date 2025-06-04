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

// Initialize Pino logger with pino-roll transport
const transport = pino.transport({
  target: 'pino-roll',
  options: {
    file: path.join(__dirname, '..', 'logs', 'app.log'), // Log file path
    frequency: 'daily',         // Rotate daily
    size: '20m',                // Rotate if file exceeds 20MB
    limit: { count: 7 },        // Keep current log + 7 old ones
    mkdir: true,                // Create log directory if it doesn't exist
    symlink: true               // Create a 'current.log' symlink
  }
});

const logger = pino(transport);

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
        parsedData = parseStormReport(rawText, id, capAlertElementForParser); // capAlertElementForParser will likely be null here
        if (parsedData) {
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
        // UGC Filtering Logic
        const ugcFilterCodesEnv = process.env.UGC_FILTER_CODES;
        if (ugcFilterCodesEnv && parsedData.ugc && parsedData.ugc.zones && parsedData.ugc.zones.length > 0) {
            const allowedUgcCodes = ugcFilterCodesEnv.split(',').map(code => code.trim().toUpperCase());
            const messageUgcZones = parsedData.ugc.zones.map(zone => zone.toUpperCase());

            const isRelevantUgc = messageUgcZones.some(zone => allowedUgcCodes.includes(zone));

            if (!isRelevantUgc) {
                logger.info(`Index.js: Message ID ${id} filtered out by UGC. Zones: [${messageUgcZones.join(', ')}]. Allowed: [${allowedUgcCodes.join(', ')}]. Not sending to webhook.`);
                return; // Stop processing this message
            }
            logger.info(`Index.js: Message ID ${id} matched UGC filter or no filter active. Zones: [${messageUgcZones.join(', ')}]. Proceeding.`);
        } else if (ugcFilterCodesEnv) {
            // logger.info(`Index.js: Message ID ${id} has no UGC zones, but UGC filter is active. Filtering out.`);
            // return;
        }

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