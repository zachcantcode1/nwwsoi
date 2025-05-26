import { parseStormReport } from './parsers/stormReportParser.js';
import { StormReportImageGeneratorService } from './stormReportImageGeneratorService.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises'; // For reading the image file
import dotenv from 'dotenv'; // For loading .env variables
import { sendToWebhook } from './webhook/sender.js'; // Import the webhook sender

// Load environment variables from .env file
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

// Derive __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sampleLSR = `
000
NWUS53 KOKX 011800
LSRNYC

PRELIMINARY LOCAL STORM REPORT...NATIONAL WEATHER SERVICE NEW YORK NY
200 PM EDT TUE APR 01 2024

..TIME...   ...EVENT...      ...CITY/COUNTY...     ...LAT.LON...
..DATE...   ....MAG....      ..COUNTY LOCATION..   ...SOURCE....
            ..REMARKS..

0155 PM     HAIL             1 N CENTRAL PARK      40.78N 73.97W 
04/01/2024  M0.75 INCH       NEW YORK NY           PUBLIC

            REMARKS.........PENNY SIZED HAIL REPORTED BY PUBLIC VIA SOCIAL MEDIA.
            LOCATION........UPPER WEST SIDE NEAR MUSEUM OF NATURAL HISTORY
            LATITUDE: 40.7812 LONGITUDE: -73.9730
            SUMMARY.........HAIL NEAR CENTRAL PARK
            SOURCE..........PUBLIC
`;

async function testStormReportImageGeneration() {
    console.log('--- Starting Storm Report Image Generation Test ---');

    // 1. Parse the sample LSR
    console.log('\n--- Parsing Storm Report ---');
    const reportId = `test-lsr-${Date.now()}`;
    const parsedData = parseStormReport(sampleLSR, reportId, null);

    if (!parsedData) {
        console.error('Failed to parse storm report. Exiting test.');
        return;
    }
    parsedData.messageType = 'storm_report'; // Add messageType for storm reports
    console.log('Parsed Data:', JSON.stringify(parsedData, null, 2));

    if (typeof parsedData.latitude === 'undefined' || typeof parsedData.longitude === 'undefined') {
        console.warn('Coordinates not found in parsed data. Map marker will not be present or map will be default.');
    }

    // 2. Instantiate the StormReportImageGeneratorService
    // Output directory will be 'output' relative to the 'src' directory of the service file
    // For this test, let's explicitly set it to be relative to this test script's location for clarity.
    const outputDir = path.join(__dirname, '..', 'output', 'test_storm_reports'); // e.g., src/output/test_storm_reports
    console.log(`\n--- Initializing Image Generator (Output Dir: ${outputDir}) ---`);
    const imageService = new StormReportImageGeneratorService(outputDir);
    await imageService._initialize(); // Ensure output directory exists

    // 3. Generate the map image
    console.log('\n--- Generating Map Image ---');
    const outputFileName = `storm_report_${reportId}.png`;
    try {
        const imagePath = await imageService.generateMapImage(parsedData, outputFileName);
        if (imagePath) {
            console.log(`\nSUCCESS: Image generated successfully at: ${imagePath}`);

            // --- Sending to Webhook ---
            const webhookUrl = process.env.WEBHOOK_URL;
            if (!webhookUrl) {
                console.error('\nERROR: WEBHOOK_URL not found in .env file. Cannot send to webhook.');
            } else {
                try {
                    console.log(`\n--- Preparing to Send to Webhook: ${webhookUrl} ---`);
                    const imageBuffer = await fs.readFile(imagePath);
                    // Note: parsedReportData already contains all necessary text fields.
                    // The stormReportImageFileName is the 'outputFileName' passed to generateMapImage.
                    await sendToWebhook(webhookUrl, parsedData, imageBuffer, outputFileName);
                    console.log('--- Data and Image sent to Webhook ---');
                } catch (webhookError) {
                    console.error('\nERROR sending to webhook:', webhookError.message ? webhookError.message : webhookError);
                }
            }
        } else {
            console.error('\nERROR: Image generation failed.');
        }

    } catch (error) {
        console.error('\nAn error occurred during the test:', error.message ? error.message : error, error.stack ? error.stack : '');
    }

    console.log('\n--- Storm Report Image Generation Test Finished ---');
}

testStormReportImageGeneration().catch(err => {
    console.error('Unhandled error in test script:', err);
});
