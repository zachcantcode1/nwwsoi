import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises'; // Added for readFile

// Determine the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Construct the path to the .env file (assuming it's in the parent directory of src)
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

console.log('Attempting to load .env from:', envPath); // Debugging line
console.log('XMPP_SERVER in index.js after dotenv.config():', process.env.XMPP_SERVER); // Debugging line
console.log('XMPP_USER in index.js after dotenv.config():', process.env.XMPP_USER); // Debugging line

import { XMPPClient } from './xmpp/client.js';
import { categorizeMessage } from './categorizer/index.js';
import { parseAlert } from './parsers/alertParser.js';
import { parseStormReport } from './parsers/stormReportParser.js';
import { StormReportImageGeneratorService } from './stormReportImageGeneratorService.js';
import { ImageGeneratorService as AlertImageGeneratorService } from './imageGeneratorService.js';
import { sendToWebhook } from './webhook/sender.js';

// Instantiate services
const stormReportImageService = new StormReportImageGeneratorService();
const alertImageService = new AlertImageGeneratorService();

// Define the message handling function
const handleIncomingMessage = async ({ rawText, id, stanza }) => {
    console.log('Index.js: Received raw message for processing:', rawText ? rawText.substring(0, 100) + "..." : "undefined", 'ID:', id);

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
        parsedData = parseAlert(rawText, id, capAlertElementForParser);
        if (parsedData) {
            parsedData.messageType = 'alert'; // Add messageType for alerts
            try {
                // Sanitize ID for use in filename
                const sanitizedId = id.replace(/[^a-zA-Z0-9_.-]/g, '_');
                // Note: alertImageService.generateImage internally creates a filename based on warningData.id
                // It returns the full path to the image.
                const imagePath = await alertImageService.generateImage(parsedData);
                
                if (imagePath) {
                    console.log(`Index.js: Image generated for alert ${id} at ${imagePath}`);
                    try {
                        const imageBuffer = await fs.readFile(imagePath);
                        parsedData.imageBuffer = imageBuffer;
                        parsedData.imageFileName = path.basename(imagePath); // Extract filename from path
                        parsedData.imagePath = imagePath; // Store full image path
                    } catch (readError) {
                        console.error(`Index.js: Error reading image file ${imagePath} for alert ${id}:`, readError.message);
                    }
                } else {
                    console.log(`Index.js: Image generation failed or returned no path for alert ${id}.`);
                }
            } catch (genError) {
                console.error(`Index.js: Error during image generation for alert ${id}:`, genError.message ? genError.message : genError);
            }
        }
    } else if (category === 'storm_report') {
        parsedData = parseStormReport(rawText, id, capAlertElementForParser); // capAlertElementForParser will likely be null here
        if (parsedData) {
            parsedData.messageType = 'storm_report'; // Add messageType for storm reports
            try {
                // Sanitize ID for use in filename (replace non-alphanumeric characters except ., _, -)
                const sanitizedId = id.replace(/[^a-zA-Z0-9_.-]/g, '_');
                const stormReportImageFileName = `storm_report_${sanitizedId}_${Date.now()}.png`;
                console.log(`Index.js: Attempting to generate image for storm report ${id} with filename ${stormReportImageFileName}`);
                
                // NOTE: This call will likely fail or produce unexpected results until
                // stormReportImageGeneratorService.js is adapted for storm report data structure and point mapping.
                const imagePath = await stormReportImageService.generateMapImage(parsedData, stormReportImageFileName);
                
                if (imagePath) {
                    console.log(`Index.js: Image generated for storm report ${id} at ${imagePath}`);
                    // Read the image file into a buffer
                    try {
                        const imageBuffer = await fs.readFile(imagePath);
                        // We will pass parsedData, imageBuffer, and stormReportImageFileName to sendToWebhook
                        // The actual call to sendToWebhook will be updated in the next step after modifying sender.js
                        // For now, let's assume sendToWebhook will handle these new arguments.
                        // This is a placeholder for the actual modification to the sendToWebhook call:
                        // await sendToWebhook(webhookUrl, parsedData, imageBuffer, stormReportImageFileName);
                        // The actual modification of the sendToWebhook call will happen after sender.js is updated.
                        // For now, we'll keep the existing call but acknowledge the data is ready.
                        parsedData.imageBuffer = imageBuffer; // Temporarily store buffer here for now
                        parsedData.imageFileName = stormReportImageFileName; // And filename
                        parsedData.imagePath = imagePath; // Store full image path

                    } catch (readError) {
                        console.error(`Index.js: Error reading image file ${imagePath} for storm report ${id}:`, readError.message);
                        // Decide if we should still send data if image reading fails
                    }
                } else {
                    console.log(`Index.js: Image generation failed or returned no path for storm report ${id}.`);
                }
            } catch (genError) {
                console.error(`Index.js: Error during image generation for storm report ${id}:`, genError.message ? genError.message : genError);
                // Consider if parsedData should still be sent to webhook if image generation fails
            }
        }
    } else {
        console.log('Index.js: Unknown message category:', category);
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
                console.log(`Index.js: Message ID ${id} filtered out by UGC. Zones: [${messageUgcZones.join(', ')}]. Allowed: [${allowedUgcCodes.join(', ')}]. Not sending to webhook.`);
                return; // Stop processing this message
            }
            console.log(`Index.js: Message ID ${id} matched UGC filter or no filter active. Zones: [${messageUgcZones.join(', ')}]. Proceeding.`);
        } else if (ugcFilterCodesEnv) {
            // Filter is set, but message has no UGC or zones. Depending on desired behavior,
            // you might want to filter these out or let them pass.
            // Current logic: if filter is set and message has no UGC, it passes.
            // To filter out messages without UGC when a filter is active:
            // console.log(`Index.js: Message ID ${id} has no UGC zones, but UGC filter is active. Filtering out.`);
            // return;
        }

        const webhookUrl = process.env.WEBHOOK_URL;
        if (!webhookUrl) {
            console.error("WEBHOOK_URL is not defined in .env file. Cannot send data.");
            return;
        }

        // Prepare for updated sendToWebhook call
        const { imageBuffer, imageFileName, imagePath: localImagePath, ...dataToSend } = parsedData;

        if (imageBuffer && imageFileName) {
            // Call sendToWebhook with separate arguments for JSON data, image buffer, and image filename
            sendToWebhook(webhookUrl, dataToSend, imageBuffer, imageFileName)
                .then(() => {
                    console.log('Index.js: Successfully sent multipart data to webhook for ID:', id);
                    if (localImagePath) { // Check if localImagePath was defined (i.e., an image was processed)
                        fs.unlink(localImagePath)
                            .then(() => console.log(`Index.js: Successfully deleted image ${localImagePath}`))
                            .catch(err => console.error(`Index.js: Error deleting image ${localImagePath}:`, err.message));
                    }
                })
                .catch(error => console.error('Index.js: Error sending multipart data to webhook for ID:', id, error.message ? error.message : error));
        } else {
            // Send data without image if image wasn't generated or read (pass undefined for buffer and filename)
            sendToWebhook(webhookUrl, dataToSend, undefined, undefined)
                .then(() => console.log('Index.js: Successfully sent data (no image) to webhook for ID:', id))
                .catch(error => console.error('Index.js: Error sending data (no image) to webhook for ID:', id, error.message ? error.message : error));
        }
    } else {
        console.log('Index.js: No parsed data to send for ID:', id);
    }
};

// Instantiate XMPPClient and pass the message handler
console.log('Instantiating XMPPClient...');
const xmppClientInstance = new XMPPClient(handleIncomingMessage);
console.log('XMPPClient instance created:', xmppClientInstance ? 'OK' : 'Failed');
console.log('typeof xmppClientInstance.connect:', typeof xmppClientInstance?.connect);

// Connect to the XMPP server
console.log('Calling xmppClientInstance.connect()...');
const connectPromise = xmppClientInstance.connect();

if (connectPromise && typeof connectPromise.then === 'function') {
    connectPromise.then(() => {
        console.log('Index.js: XMPP client connect() promise resolved. Connection process likely successful or ongoing (check XMPPClient logs).');
    })
        .catch(error => {
            console.error('Index.js: Failed to connect XMPP client (connect() promise rejected):', error.message ? error.message : error);
            // process.exit(1); // Consider if exit is appropriate or if reconnect logic handles it
        });
} else {
    console.error('FATAL: xmppClientInstance.connect() did not return a Promise. Check XMPPClient implementation.');
    process.exit(1);
}

// Graceful shutdown
async function shutdown() {
    console.log('Initiating graceful shutdown...');
    if (xmppClientInstance) {
        await xmppClientInstance.disconnect();
    }
    console.log('Shutdown complete.');
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);