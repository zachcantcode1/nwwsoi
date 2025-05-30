/**
 * stormReportImageGeneratorService.js
 *
 * Service to generate map images (PNG) from parsed storm report data.
 * Replicates and adapts functionality from the Python map_service.py.
 * Assumes it receives pre-parsed report data from the XMPP server.
 */

// Required modules
import pino from 'pino';
import * as turf from '@turf/turf'; // For geospatial operations
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer'; // ES module import for Puppeteer
import { fileURLToPath } from 'url'; // For __dirname in ES modules
import { dirname } from 'path'; // For __dirname in ES modules

// Derive __dirname equivalent for ES modules *within this file*
const __filename_service = fileURLToPath(import.meta.url);
const __dirname_service = path.dirname(__filename_service);

// Configuration
const OUTPUT_DIR = path.join(__dirname_service, '..', 'output');
const COUNTY_GEOJSON_PATH = path.join(__dirname_service, '..', 'data', 'shapefiles', 'counties.geojson'); // Path to your counties GeoJSON
const ALERT_FRAME_CSS_PATH = path.join(__dirname_service, 'templates', 'map_templates', 'alert_frame.css'); // Adjusted path
const LOGO_PATH = path.join(__dirname_service, '..', 'assets', 'Transparent WKYW Logo.png'); // Path to your logo, adjust if moved

const NWS_EVENT_COLORS = {
    "tsunami warning": "#FD6347",
    "tornado warning": "#FF0000",
    "extreme wind warning": "#FF8C00",
    "severe thunderstorm warning": "#FFA500",
    "flash flood warning": "#8B0000",
    "flash flood statement": "#8B0000",
    "severe weather statement": "#00FFFF",
    "shelter in place warning": "#FA8072",
    "evacuation immediate": "#7FFF00",
    "civil danger warning": "#FFB6C1",
    "nuclear power plant warning": "#4B0082",
    "radiological hazard warning": "#4B0082",
    "hazardous materials warning": "#4B0082",
    "fire warning": "#A0522D",
    "civil emergency message": "#FFB6C1",
    "law enforcement warning": "#C0C0C0",
    "storm surge warning": "#B524F7",
    "hurricane force wind warning": "#CD5C5C",
    "hurricane warning": "#DC143C",
    "typhoon warning": "#DC143C",
    "special marine warning": "#FFA500",
    "blizzard warning": "#FF4500",
    "snow squall warning": "#C71585",
    "ice storm warning": "#8B008B",
    "heavy freezing spray warning": "#00BFFF",
    "winter storm warning": "#FF69B4",
    "lake effect snow warning": "#008B8B",
    "dust storm warning": "#FFE4C4",
    "blowing dust warning": "#FFE4C4",
    "high wind warning": "#DAA520",
    "tropical storm warning": "#B22222",
    "storm warning": "#9400D3",
    "tsunami advisory": "#D2691E",
    "tsunami watch": "#FF00FF",
    "avalanche warning": "#1E90FF",
    "earthquake warning": "#8B4513",
    "volcano warning": "#2F4F4F",
    "ashfall warning": "#A9A9A9",
    "flood warning": "#00FF00",
    "coastal flood warning": "#228B22",
    "lakeshore flood warning": "#228B22",
    "ashfall advisory": "#696969",
    "high surf warning": "#228B22",
    "excessive heat warning": "#C71585",
    "tornado watch": "#FFFF00",
    "severe thunderstorm watch": "#DB7093",
    "flash flood watch": "#2E8B57",
    "gale warning": "#DDA0DD",
    "flood statement": "#00FF00",
    "extreme cold warning": "#0000FF",
    "freeze warning": "#483D8B",
    "red flag warning": "#FF1493",
    "storm surge watch": "#DB7FF7",
    "hurricane watch": "#FF00FF",
    "hurricane force wind watch": "#9932CC",
    "typhoon watch": "#FF00FF",
    "tropical storm watch": "#F08080",
    "storm watch": "#FFE4B5",
    "tropical cyclone local statement": "#FFE4B5",
    "winter weather advisory": "#7B68EE",
    "avalanche advisory": "#CD853F",
    "cold weather advisory": "#AFEEEE",
    "heat advisory": "#FF7F50",
    "flood advisory": "#00FF7F",
    "coastal flood advisory": "#7CFC00",
    "lakeshore flood advisory": "#7CFC00",
    "high surf advisory": "#BA55D3",
    "dense fog advisory": "#708090",
    "dense smoke advisory": "#F0E68C",
    "small craft advisory": "#D8BFD8",
    "brisk wind advisory": "#D8BFD8",
    "hazardous seas warning": "#D8BFD8",
    "dust advisory": "#BDB76B",
    "blowing dust advisory": "#BDB76B",
    "lake wind advisory": "#D2B48C",
    "wind advisory": "#D2B48C",
    "frost advisory": "#6495ED",
    "freezing fog advisory": "#008080",
    "freezing spray advisory": "#00BFFF",
    "low water advisory": "#A52A2A",
    "local area emergency": "#C0C0C0",
    "winter storm watch": "#4682B4",
    "rip current statement": "#40E0D0",
    "beach hazards statement": "#40E0D0",
    "gale watch": "#FFC0CB",
    "avalanche watch": "#F4A460",
    "hazardous seas watch": "#483D8B",
    "heavy freezing spray watch": "#BC8F8F",
    "flood watch": "#2E8B57",
    "coastal flood watch": "#66CDAA",
    "lakeshore flood watch": "#66CDAA",
    "high wind watch": "#B8860B",
    "excessive heat watch": "#800000",
    "extreme cold watch": "#5F9EA0",
    "freeze watch": "#00FFFF",
    "fire weather watch": "#FFDEAD",
    "extreme fire danger": "#E9967A",
    "911 telephone outage": "#C0C0C0",
    "coastal flood statement": "#6B8E23",
    "lakeshore flood statement": "#6B8E23",
    "special weather statement": "#FFE4B5",
    "marine weather statement": "#FFDAB9",
    "air quality alert": "#808080",
    "air stagnation advisory": "#808080",
    "hazardous weather outlook": "#EEE8AA",
    "hydrologic outlook": "#90EE90",
    "short term forecast": "#98FB98",
    "administrative message": "#C0C0C0",
    "test": "#F0FFFF",
    "child abduction emergency": "#FFFFFF",
    "blue alert": "#FFFFFF"
};

export class StormReportImageGeneratorService {
    constructor(outputDir, loggerInstance) {
        // Use derived __dirname_service for default output directory
        this.outputDir = outputDir || path.join(__dirname_service, '..', 'output');
        this.logger = loggerInstance || pino({ level: 'info', name: 'StormReportImageGeneratorServiceInternalLogger' });

        // Log the level of the logger being used by this instance
        // Use a more distinct message for this initial log
        this.logger.info(`[StormReportImageGeneratorService Constructor] Logger initialized. Effective logger level: ${this.logger.level}. Passed logger level: ${loggerInstance ? loggerInstance.level : 'NOT PASSED'}`);

        this.alertFrameCssPath = ALERT_FRAME_CSS_PATH; // Uses globally defined path
        this.logger.debug(`[StormReportImageGeneratorService Constructor] ALERT_FRAME_CSS_PATH is: ${this.alertFrameCssPath}`);

        if (!this.outputDir) {
            this.logger.error('[StormReportImageGeneratorService Constructor] Output directory is not defined.');
            throw new Error('Output directory is required for StormReportImageGeneratorService.');
        }
        // Ensure Puppeteer is available (basic check)
        if (typeof puppeteer === 'undefined') {
            const puppeteerErrorMsg = '[StormReportImageGeneratorService Constructor] Puppeteer module is not available or not imported correctly.';
            this.logger.error(puppeteerErrorMsg);
            throw new Error(puppeteerErrorMsg);
        }
    }

    async _initialize() {
        try {
            await fs.mkdir(this.outputDir, { recursive: true });
        } catch (error) {
            this.logger.error('Failed to create output directory:', error);
        }
    }

    async generateMapImage(reportData, outputFileName) {
        this.logger.info(`Generating map for storm report ID: ${reportData.id}`);
        let browser = null;
        try {
            const mapHtml = await this._buildStormReportMapHtml(reportData);
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 2 });
            await page.setContent(mapHtml, { waitUntil: 'networkidle0' });
            const imagePath = path.join(this.outputDir, outputFileName);
            await page.screenshot({ path: imagePath });
            this.logger.info(`Map image saved to ${imagePath}`);
            return imagePath;
        } catch (error) {
            this.logger.error(`Error generating map image for storm report ${reportData.id}: ${error.message}`);
            return null;
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    async _buildStormReportMapHtml(reportData) {
        // Ensure basic data is present
        const id = reportData.id || 'N/A';
        const eventType = reportData.type || 'Storm Report'; // Use reportData.type
        const rawSummary = reportData.summary || 'No summary available.';
        const summary = ['TSTM WND DMG', 'NON TSTM WND DMG']
            .includes(rawSummary.toUpperCase())
            ? 'WIND DAMAGE'
            : rawSummary;
        const eventLocation = reportData.eventLocation || 'Location not specified.';
        const eventTime = reportData.eventTime || 'Time not specified.';
        const dataSource = reportData.dataSource || 'Source not specified.';
        const remarks = reportData.remarks || 'No remarks.';
        const rawText = reportData.raw_product_text || '';
        const magnitude = reportData.magnitude || 'N/A';

        // Generic color for storm reports, or derive one if needed later
        const reportColor = "#4682B4"; // Steel Blue, a generic color

        let cssContent = '';
        try {
            cssContent = await fs.readFile(this.alertFrameCssPath, 'utf8');
        } catch (err) {
            this.logger.error(`Error reading CSS file at ${this.alertFrameCssPath}:`, err);
            cssContent = '/* CSS could not be loaded */';
        }

        // For storm reports, we'll eventually use reportData.latitude and reportData.longitude
        // For now, set a default map center and zoom. Geocoding will be a separate step.
        const defaultLatitude = 39.8283; // Approx. center of US
        const defaultLongitude = -98.5795;
        const defaultZoom = 4;

        // Placeholder for actual coordinates once geocoding is implemented
        const reportLatitude = reportData.latitude || defaultLatitude;
        const reportLongitude = reportData.longitude || defaultLongitude;
        const mapZoom = reportData.latitude ? 10 : defaultZoom; // Zoom in if we have a point

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Storm Report: ${summary}</title>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                <style>
                    ${cssContent}
                    /* Additional styles for storm reports if needed */
                </style>
            </head>
            <body>
                <div class="page-title-bar" style="background-color: ${reportColor};">
                    ${summary}
                </div>
                <div class="main-content-area">
                    <div class="map-panel">
                        <div id="map"></div>
                    </div>
                    <div class="sidebar-panel">
                        <h3>${eventType}</h3>
                        <div class="sidebar-card"><p><strong>Location:</strong> ${eventLocation}</p></div>
                        <div class="sidebar-card"><p><strong>Time:</strong> ${eventTime}</p></div>
                        <div class="sidebar-card"><p><strong>Magnitude:</strong> ${magnitude}</p></div>
                        <div class="sidebar-card"><p><strong>Source:</strong> ${dataSource}</p></div>
                        <div class="sidebar-card remarks-card"><p>${remarks.replace(/\n/g, '<br>')}</p></div>
                        
                    </div>
                </div>

                <script>
                    var map = L.map('map', { zoomControl: false }).setView([${reportLatitude}, ${reportLongitude}], ${mapZoom});
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        maxZoom: 19,
                        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    }).addTo(map);

                    if (typeof ${reportData.latitude} !== 'undefined' && typeof ${reportData.longitude} !== 'undefined') {
                        L.marker([${reportData.latitude}, ${reportData.longitude}]).addTo(map);
                        console.log('Leaflet: Marker added at ' + ${reportData.latitude} + ', ' + ${reportData.longitude});
                    } else {
                        console.log('Leaflet: Latitude or Longitude not available in reportData, marker not added.');
                    }

                    // Simplified map interaction - no complex bounds fitting for now
                    map.on('load', function() { map.invalidateSize(); });
                </script>
            </body>
            </html>
        `;
    }
}
