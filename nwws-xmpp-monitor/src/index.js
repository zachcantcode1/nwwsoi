import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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
import categorizeMessage from './categorizer/index.js';
import { parseAlert } from './parsers/alertParser.js';
import { parseStormReport } from './parsers/stormReportParser.js';
import { sendToWebhook } from './webhook/sender.js';

// Define the message handling function
const handleIncomingMessage = ({ rawText, id, stanza }) => {
    console.log('Index.js: Received raw message for processing:', rawText ? rawText.substring(0, 100) + "..." : "undefined", 'ID:', id);

    // The `stanza` object from @xmpp/client is an instance of an XML Element.
    // We can pass it to the categorizer and parsers.
    const categoryResult = categorizeMessage(rawText, id, stanza);
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
    } else if (category === 'storm_report') {
        parsedData = parseStormReport(rawText, id, capAlertElementForParser); // Also pass capAlertElementForParser or a specific storm report element if applicable
    } else {
        console.log('Index.js: Unknown message category:', category);
        return;
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
        sendToWebhook(webhookUrl, parsedData)
            .then(() => console.log('Index.js: Successfully sent data to webhook for ID:', id))
            .catch(error => console.error('Index.js: Error sending data to webhook for ID:', id, error.message ? error.message : error));
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