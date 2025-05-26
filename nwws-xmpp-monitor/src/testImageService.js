import { ImageGeneratorService } from './imageGeneratorService.js';
import pino from 'pino';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { sendToWebhook } from './webhook/sender.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Derive __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Pino logger with 'debug' level
const logger = pino({ level: 'debug' });

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

// Paste the sampleWarningData object here
const sampleWarningData = {
    id: "NWS-OI-SVR-TEST-20240526",
    messageType: "alert",
    event: "Severe Thunderstorm Warning",
    headline: "Severe Thunderstorm Warning for Anytown until 9:30 PM",
    description: "The National Weather Service has issued a Severe Thunderstorm Warning. HAZARD...60 mph wind gusts and quarter size hail (1.00 inch). IMPACT...Hail damage to vehicles is expected. Expect wind damage to roofs, siding, and trees. SOURCE...Radar indicated.",
    affectedAreasDescription: "Anytown, Example County, Rural Area",
    issuingOffice: "NWS Metropolis",
    geometry: {
        type: "Polygon",
        coordinates: [
            [
                [-90.0, 35.0], [-89.5, 35.2], [-89.7, 35.5], [-90.2, 35.3], [-90.0, 35.0]
            ]
        ]
    },
    cap: {
        sender: "NWS Metropolis Weather Service Office",
        sent: "2024-05-26T20:00:00-05:00",
        status: "Actual",
        msgType: "Alert",
        scope: "Public",
        event: "Severe Thunderstorm Warning",
        urgency: "Immediate",
        severity: "Severe",
        certainty: "Observed",
        effective: "2024-05-26T20:00:00-05:00",
        onset: "2024-05-26T20:00:00-05:00",
        expires: "2024-05-26T21:30:00-05:00",
        headline: "Severe Thunderstorm Warning issued May 26 at 8:00PM CDT until May 26 at 9:30PM CDT by NWS Metropolis",
        description: "The National Weather Service in Metropolis has issued a * Severe Thunderstorm Warning for...\n\nHAZARD...60 mph wind gusts and quarter size hail.\n\nSOURCE...Radar indicated.\n\nIMPACT...Hail damage to vehicles is expected. Expect wind damage to roofs, siding, and trees.\n\nLocations impacted include...\nAnytown, Rural Area, Example County.\n\nPRECAUTIONARY/PREPAREDNESS ACTIONS...\n\nFor your protection move to an interior room on the lowest floor of a building.",
        instruction: "Move to an interior room on the lowest floor of a building. Take cover now!",
        areaDesc: "Anytown; Example County; Rural Area",
        parameters: [
            { valueName: "MaxWindGust", value: "52" },
            { valueName: "MaxHailSize", value: "1.00" }
        ]
    }
};

async function runTest() {
    logger.info('Starting ImageGeneratorService test...');
    const imageService = new ImageGeneratorService(OUTPUT_DIR, logger);
    const webhookUrl = process.env.WEBHOOK_URL;

    if (!webhookUrl) {
        logger.error('WEBHOOK_URL is not defined in your .env file. Cannot send to webhook.');
    }

    try {
        logger.info('Calling generateImage with sample data...');
        const imagePath = await imageService.generateImage(sampleWarningData);
        logger.info(`Successfully generated image: ${imagePath}`);
        logger.info(`Please check the 'output' directory (usually nwws-xmpp-monitor/output/) for the PNG file.`);

        if (imagePath && webhookUrl) {
            logger.info(`Preparing to send image and data to webhook: ${webhookUrl}`);
            try {
                const imageBuffer = await fs.readFile(imagePath);
                const imageFileName = path.basename(imagePath);
                
                await sendToWebhook(webhookUrl, sampleWarningData, imageBuffer, imageFileName);
                logger.info(`Data and image sent to webhook successfully.`);
            } catch (webhookError) {
                logger.error('Error sending data to webhook:');
                logger.error(webhookError.stack || webhookError.message || webhookError);
            }
        } else if (imagePath && !webhookUrl) {
            logger.warn('Image generated, but WEBHOOK_URL not set. Skipping webhook send.');
        } else if (!imagePath) {
            logger.warn('Image generation failed, cannot send to webhook.');
        }

    } catch (error) {
        logger.error('Error during image generation test:');
        logger.error(error.stack); // Log the full error stack
    }
}

runTest();
