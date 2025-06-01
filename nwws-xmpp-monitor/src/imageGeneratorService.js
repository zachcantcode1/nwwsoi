/**
 * imageGeneratorService.js
 *
 * Service to generate map images (PNG) from parsed weather warning data.
 * Replicates and adapts functionality from the Python map_service.py.
 * Assumes it receives pre-parsed warning data from the XMPP server.
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
    "severe thunderstorm warning": "#FFBF00", // Changed from #FFA500
    "flash flood warning": "#E60000", // Changed from #8B0000
    "flash flood statement": "#E60000", // Also update statement to match warning
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
    "special weather statement": "#00FAD4",
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

export class ImageGeneratorService {
    constructor(outputDir, loggerInstance) {
        // Use derived __dirname_service for default output directory
        this.outputDir = outputDir || path.join(__dirname_service, '..', 'output');
        this.logger = loggerInstance || pino({ level: 'info', name: 'ImageGeneratorServiceInternalLogger' });

        // Log the level of the logger being used by this instance
        // Use a more distinct message for this initial log
        this.logger.info(`[ImageGeneratorService Constructor] Logger initialized. Effective logger level: ${this.logger.level}. Passed logger level: ${loggerInstance ? loggerInstance.level : 'NOT PASSED'}`);

        this.alertFrameCssPath = ALERT_FRAME_CSS_PATH; // Uses globally defined path
        this.logger.debug(`[ImageGeneratorService Constructor] ALERT_FRAME_CSS_PATH is: ${this.alertFrameCssPath}`);

        if (!this.outputDir) {
            this.logger.error('[ImageGeneratorService Constructor] Output directory is not defined.');
            throw new Error('Output directory is required for ImageGeneratorService.');
        }
        // Ensure Puppeteer is available (basic check)
        if (typeof puppeteer === 'undefined') {
            const puppeteerErrorMsg = '[ImageGeneratorService Constructor] Puppeteer module is not available or not imported correctly.';
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

    async generateMapImage(warningData, outputFileName) {
        console.info(`Generating map for warning ID: ${warningData.id}`);
        let browser = null;
        try {
            const mapHtml = await this._buildMapHtml(warningData);
            browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            const page = await browser.newPage();
            await page.setContent(mapHtml, { waitUntil: 'networkidle0' });
            const imagePath = path.join(OUTPUT_DIR, outputFileName);
            await page.screenshot({ path: imagePath });
            console.info(`Map image saved to ${imagePath}`);
            return imagePath;
        } catch (error) {
            console.error(`Error generating map image: ${error.message}`);
            return null;
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    async _buildMapHtml(warningData) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Weather Alert Map</title>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
                <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
                <style>
                    body { margin: 0; font-family: sans-serif; }
                    #map { height: 600px; width: 800px; }
                </style>
            </head>
            <body>
                <div id="map"></div>
                <script>
                    const map = L.map('map').setView([39.8283, -98.5795], 4);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: 'OpenStreetMap' }).addTo(map);
                </script>
            </body>
            </html>
        `;
    }

    async generateImage(warningData) {
        if (!warningData || !warningData.id) {
            this.logger.error('Invalid warningData or missing ID for image generation.');
            throw new Error('Invalid warningData or missing ID.');
        }
        this.logger.info(`Generating image for warning ID: ${warningData.id}`);
        const imageFileName = `warning_${warningData.id}_${Date.now()}.jpeg`;
        const imagePath = path.join(this.outputDir, imageFileName);

        try {
            const eventType = warningData.event || warningData.cap?.event || 'Unknown Event';
            const warningColor = this._getWarningColor(eventType);
            const expires = this._formatExpiresTime(warningData.cap?.expires); // Renamed from formattedExpires
            const affectedAreas = this._extractAffectedAreas(warningData);
            const hazards = this._extractHazardsFromDescription(warningData);
            const headline = warningData.headline || warningData.cap?.headline || 'Weather Alert';
            const issuingOffice = warningData.senderName || warningData.cap?.senderName || warningData.cap?.sender || 'NWS';

            // Prepare map-related data
            let polygonGeoJson = null;
            let mapCenter = [39.8283, -98.5795]; // Default center (USA)
            let mapZoom = 4; // Default zoom for main map
            const insetMapZoom = 4; // Zoom level for the inset map (state level)

            if (warningData.geometry && warningData.geometry.type === 'Polygon' && 
                warningData.geometry.coordinates && warningData.geometry.coordinates[0] && 
                warningData.geometry.coordinates[0].length > 0) {
                
                polygonGeoJson = warningData.geometry; 
                this.logger.debug(`[generateImage] Polygon GeoJSON for template: ${JSON.stringify(polygonGeoJson)}`);

                try {
                    const turfPolygon = turf.polygon(warningData.geometry.coordinates);
                    const centerPoint = turf.centroid(turfPolygon);
                    mapCenter = [centerPoint.geometry.coordinates[1], centerPoint.geometry.coordinates[0]]; // [lat, lon]
                    
                    // Calculate zoom level based on polygon bounds (simplified from _calculateZoomLevel)
                    // This is a placeholder for a more robust zoom calculation if needed.
                    // For now, we'll try to fit bounds in the Leaflet script itself.
                    // mapZoom = this._calculateZoomLevel(warningData.geometry.coordinates[0]); // Or a similar logic
                    // For simplicity, we'll let Leaflet's fitBounds handle zoom primarily.
                    // If a more specific initial zoom is needed, _calculateZoomLevel can be reinstated here.
                    this.logger.debug(`[generateImage] Calculated mapCenter: ${mapCenter}`);
                } catch (turfError) {
                    this.logger.error(`[generateImage] Error processing geometry with Turf.js: ${turfError.message}. Using default map center/zoom.`);
                    polygonGeoJson = null; // Nullify if there's an error, so map doesn't try to render faulty polygon
                }
            } else {
                this.logger.warn('[generateImage] No valid polygon geometry found in warningData for map display.');
            }

            // Convert polygon string to coordinate array if needed
            if (warningData.polygon && typeof warningData.polygon === 'string') {
                this.logger.debug(`Converting polygon string: ${warningData.polygon.substring(0, 30)}...`);
                warningData.polygon = this._parsePolygonString(warningData.polygon);
                this.logger.debug(`Converted to array with ${warningData.polygon.length} points`);
                this.logger.silly(`First 2 points: ${JSON.stringify(warningData.polygon.slice(0, 2))}`);
            }

            const templateData = {
                polygonGeoJson, // Added
                mapCenter,      // Added
                mapZoom,        // Added
                insetMapZoom,   // Added for the new inset map
                warningColor,
                eventType,
                headline,
                expires,        // Corrected name
                affectedAreas,
                hazards,
                issuingOffice,
                magnitude: warningData.magnitude
            };
            const htmlContent = await this._getHtmlForPuppeteer(templateData);

            await fs.mkdir(this.outputDir, { recursive: true });

            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 2 });

            page.on('console', msg => {
                const msgArgs = msg.args();
                for (let i = 0; i < msgArgs.length; ++i) {
                    msgArgs[i].jsonValue().then(jsonValue => {
                        this.logger.debug(`PUPPETEER PAGE LOG: ${typeof jsonValue === 'object' ? JSON.stringify(jsonValue) : jsonValue}`);
                    }).catch(() => {
                        this.logger.debug(`PUPPETEER PAGE LOG (arg ${i}): [Unserializable value]`);
                    });
                }
            });
            page.on('pageerror', error => {
                this.logger.error(`PUPPETEER PAGE ERROR: ${error.message}`);
            });

            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

            try {
                await page.waitForFunction('window.mapReady === true', { timeout: 10000 });
                this.logger.debug('window.mapReady was true.');
            } catch (e) {
                this.logger.warn('Timeout or error waiting for window.mapReady:', e.message);
            }

            this.logger.debug(`Starting image generation for ${warningData.id}`);
            await page.screenshot({ path: imagePath, type: 'jpeg', quality: 85 });
            this.logger.debug(`Rendered HTML map for ${warningData.id}`);
            this.logger.debug(`Image created at ${imagePath}`);

            await page.waitForNetworkIdle({ idleTime: 500, timeout: 60000 });

            // Log the rendered HTML of key components before taking the screenshot
            const sidebarHTML = await page.evaluate(() => document.querySelector('.sidebar-panel')?.innerHTML);
            this.logger.debug(`[PUPPETEER RENDERED] Sidebar HTML: ${sidebarHTML}`);

            const mapPanelHTML = await page.evaluate(() => document.querySelector('.map-panel')?.innerHTML);
            this.logger.debug(`[PUPPETEER RENDERED] Map Panel HTML: ${mapPanelHTML}`);

            // Log computed styles of the map div
            const mapComputedStyles = await page.evaluate(() => {
                const mapEl = document.getElementById('map');
                if (!mapEl) return { error: 'Map element not found' };
                const styles = window.getComputedStyle(mapEl);
                return {
                    width: styles.width,
                    height: styles.height,
                    border: styles.border,
                    display: styles.display,
                    visibility: styles.visibility,
                    backgroundColor: styles.backgroundColor
                };
            });
            this.logger.debug({'[PUPPETEER RENDERED] Map Computed Styles': mapComputedStyles});

            await browser.close();
            this.logger.info(`Successfully generated image: ${imagePath}`);
            return imagePath;
        } catch (error) {
            this.logger.error(`Error generating image for ${warningData.id}: ${error.message}`, { stack: error.stack });
            this.logger.debug(`Error stack: ${error.stack}`);
            try {
                if (await fs.stat(imagePath).catch(() => false)) {
                    await fs.unlink(imagePath);
                }
            } catch (cleanupError) {
                this.logger.warn(`Failed to cleanup image file ${imagePath}: ${cleanupError.message}`);
            }
            throw error;
        }
    }

    // Add polygon parsing method
    _parsePolygonString(polygonStr) {
        if (!polygonStr) return [];
        
        return polygonStr.split(' ').map(coord => {
            const [lat, lng] = coord.split(',').map(Number);
            return [lng, lat]; // Leaflet uses [lng, lat] order
        });
    }

    async _getHtmlForPuppeteer(data) {
        this.logger.debug({ detailedTemplateData: data }, '[GET_HTML] Full templateData object received for HTML generation.');

        const { 
            eventType, 
            expires, 
            affectedAreas, 
            hazards, 
            issuingOffice, 
            warningColor, 
            headline, 
            polygonGeoJson, // Expecting this to be the GeoJSON object for the polygon
            mapCenter,      // Expecting this to be an array like [lat, lon]
            mapZoom,        // Expecting this to be a number
            insetMapZoom,   // Expecting this to be a number
            magnitude
        } = data;

        const cssContent = await this._loadCssContent();

        // Basic parsing for wind and hail from the hazards string
        let windValue = "N/A";
        let hailValue = "N/A";

        if (hazards) {
            // Try to find wind speed (e.g., "60 MPH" or "60mph")
            const windMatch = hazards.match(/(\d+(\.\d+)?)\s*M?P?H?/i);
            if (windMatch && windMatch[1]) {
                windValue = windMatch[1] + " MPH";
            }

            // Try to find hail size (e.g., "1.00 inches" or "1.00 inch")
            const hailMatch = hazards.match(/(\d+(\.\d+)?)\s*INCH(ES)?/i);
            if (hailMatch && hailMatch[1]) {
                hailValue = hailMatch[1] + " IN"; // Using IN for brevity in the card
            }
        }
        this.logger.debug(`Parsed hazards - Wind: ${windValue}, Hail: ${hailValue}`);

        // Prepare polygonGeoJson as a string once to avoid issues with undefined/null in template
        const polygonGeoJsonString = polygonGeoJson ? JSON.stringify(polygonGeoJson) : 'null';

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Weather Alert: ${eventType || 'Weather Alert'}</title>
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin=""/>
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
                <style>
                    ${cssContent}
                    /* Ensure page-title-bar dynamic color is applied */
                    .page-title-bar {
                        background-color: ${warningColor || '#FF0000'}; /* Dynamic color, fallback to red */
                        color: #FFFFFF; /* Ensure text is white */
                    }
                </style>
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; background-color: #1C1C1C; color: #e0e0e0; display: flex; flex-direction: column; height: 100vh;">
                <div class="page-title-bar">
                    ${eventType || 'Weather Alert'}
                </div>
                <div class="main-content-area">
                    <div class="map-panel">
                        <div id="map"></div>
                    </div>
                    <div class="sidebar-panel">
                        <div class="sidebar-card"><p><strong>Expires:</strong> ${expires || 'N/A'}</p></div>
                        <div class="sidebar-card"><p><strong>Affected Areas:</strong> ${affectedAreas || 'Not specified'}</p></div>
                        
                        <div class="hazard-details-container">
                            <div class="hazard-detail-card">
                                <div class="hazard-detail-title">WIND</div>
                                <div class="hazard-detail-value">${windValue}</div>
                            </div>
                            <div class="hazard-detail-card">
                                <div class="hazard-detail-title">HAIL</div>
                                <div class="hazard-detail-value">${hailValue}</div>
                            </div>
                            ${magnitude ? `
                            <div class="hazard-detail-card">
                                <div class="hazard-detail-title">MAGNITUDE</div>
                                <div class="hazard-detail-value">${magnitude}</div>
                            </div>
                            ` : ''}
                        </div>

                        <div class="sidebar-card"><p><strong>Issuing Office:</strong> ${issuingOffice || 'NWS'}</p></div>
                        <div id="inset-map"></div>
                    </div>
                </div>

                <script>
                    document.addEventListener('DOMContentLoaded', function () {
                        try { // Outer try-catch for all JS
                            const effectiveMapCenter = [${(mapCenter && mapCenter.length === 2) ? mapCenter[0] : 39.8283}, ${(mapCenter && mapCenter.length === 2) ? mapCenter[1] : -98.5795}];
                            const effectiveMapZoom = typeof mapZoom === 'number' ? mapZoom : 4;
                            const effectiveInsetMapZoom = typeof insetMapZoom === 'number' ? insetMapZoom : 6;
                            const effectiveWarningColor = "${warningColor || '#FFA500'}";
                            const polygonData = ${polygonGeoJsonString}; // Moved polygonData here

                            // Main Map Initialization
                            try {
                                const map = L.map('map', {
                                    center: effectiveMapCenter,
                                    zoom: effectiveMapZoom,
                                    dragging: false,
                                    touchZoom: false,
                                    doubleClickZoom: false,
                                    scrollWheelZoom: false,
                                    boxZoom: false,
                                    keyboard: false,
                                    zoomControl: false,
                                    attributionControl: true 
                                });

                                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                    maxZoom: 19,
                                    attribution: 'OpenStreetMap contributors'
                                }).addTo(map);

                                if (polygonData && polygonData.type) {
                                    console.log('[Leaflet Script] Main Map Polygon Data for L.geoJSON:', JSON.stringify(polygonData));
                                    L.geoJSON(polygonData, {
                                        style: function (feature) {
                                            return {
                                                color: effectiveWarningColor,
                                                weight: 3,
                                                opacity: 0.7,
                                                fillColor: effectiveWarningColor,
                                                fillOpacity: 0.2
                                            };
                                        }
                                    }).addTo(map);
                                    map.fitBounds(L.geoJSON(polygonData).getBounds().pad(0.1)); // Adjust padding as needed
                                    console.log('[Leaflet Script] Main map polygon layer added and map bounds fitted.');
                                } else {
                                    console.log('[Leaflet Script] No polygon data for main map.');
                                }
                                window.mapReady = true; // Main map success
                            } catch (e) {
                                console.error('[Leaflet Script] Error initializing main map:', e);
                                document.getElementById('map').innerHTML = '<p style="color: red; text-align: center;">Error loading main map: ' + e.message + '</p>';
                                window.mapReady = false; // Main map failure
                            }

                            // Inset Map Initialization
                            try {
                                const insetMap = L.map('inset-map', {
                                    center: effectiveMapCenter,
                                    zoom: effectiveInsetMapZoom,
                                    dragging: false,
                                    touchZoom: false,
                                    doubleClickZoom: false,
                                    scrollWheelZoom: false,
                                    boxZoom: false,
                                    keyboard: false,
                                    zoomControl: false, 
                                    attributionControl: false 
                                });

                                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                    maxZoom: 18,
                                }).addTo(insetMap);

                                if (polygonData && polygonData.type) {
                                    console.log('[Leaflet Script] Inset Map Polygon Data for L.geoJSON:', JSON.stringify(polygonData));
                                    L.geoJSON(polygonData, {
                                        style: function (feature) {
                                            return {
                                                color: effectiveWarningColor,
                                                weight: 2, 
                                                opacity: 0.6,
                                                fillColor: effectiveWarningColor,
                                                fillOpacity: 0.15
                                            };
                                        }
                                    }).addTo(insetMap);
                                    console.log('[Leaflet Script] Inset map polygon layer added.');
                                } else {
                                    console.log('[Leaflet Script] No polygon data for inset map.');
                                }
                            } catch (e) {
                                console.error('[Leaflet Script] Error initializing inset map:', e);
                                document.getElementById('inset-map').innerHTML = '<p style="color: red; text-align: center;">Error loading inset map: ' + e.message + '</p>';
                                // Do not set window.mapReady to false here, as main map might be fine
                            }
                        } catch (e) { // Catch errors in defining effective vars or other general setup
                            console.error('[Leaflet Script] General error in Leaflet setup:', e);
                            window.mapReady = false; // General failure
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    async _loadCssContent() {
        try {
            const cssContent = await fs.readFile(this.alertFrameCssPath, 'utf-8');
            this.logger.debug(`[CSS Load] Successfully loaded CSS from ${this.alertFrameCssPath}`);
            return cssContent;
        } catch (err) {
            this.logger.error(`[CSS Load] Error reading CSS file ${this.alertFrameCssPath}, using fallback styles: ${err.message}`);
            // Fallback CSS (minimal)
            return `
                body { margin: 0; font-family: sans-serif; background-color: #1C1C1C; color: #e0e0e0; }
                .page-title-bar { background-color: #FFA500; color: #FFFFFF; padding: 10px; text-align: center; font-size: 1.5em; }
                .main-content-area { display: flex; height: calc(100vh - 50px); }
                .map-panel { flex: 3; position: relative; background-color: #333; }
                #map { height: 100%; width: 100%; background-color: #23272a; }
                .sidebar-panel { flex: 1; padding: 15px; background-color: #2C2F33; overflow-y: auto; font-size: 0.9em; }
                .sidebar-panel h3 { margin-top: 0; color: #FFA500; }
                .sidebar-panel p { margin-bottom: 10px; }
                .sidebar-panel strong { color: #a9a9a9; }
                .sidebar-card { background-color: #3a3f44; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
                .hazard-details-container { display: flex; justify-content: space-between; margin-bottom: 10px; }
                .hazard-detail-card { background-color: #2C2F33; /* Same as sidebar for now */ padding: 10px; border-radius: 5px; width: 48%; /* Adjust width for spacing */ box-sizing: border-box; display: flex; flex-direction: column; align-items: center; text-align: center; }
                .hazard-detail-title { font-weight: bold; margin-bottom: 5px; font-size: 0.9em; color: #a9a9a9; }
                .hazard-detail-value { font-size: 1.1em; color: #FFFFFF; }
            `;
        }
    }

    async _getImageBase64(imagePath) { 
        return ''; /* placeholder */
    }

    _calculatePolygonCenter(polygonCoords) { 
        if (!polygonCoords || polygonCoords.length < 3) {
            console.error('Polygon has too few coordinates to calculate a center.');
            return [0, 0]; 
        }
        try {
            const turfPolygon = turf.polygon([polygonCoords]); 
            const centerPoint = turf.centroid(turfPolygon);
            return centerPoint.geometry.coordinates; 
        } catch (error) {
            console.error('Error calculating polygon center with Turf.js:', error);
            let sumLon = 0;
            let sumLat = 0;
            for (const coord of polygonCoords) {
                sumLon += coord[0];
                sumLat += coord[1];
            }
            return [sumLon / polygonCoords.length, sumLat / polygonCoords.length];
        }
    }
    _calculateZoomLevel(polygonCoords, mapWidthPx = 800, mapHeightPx = 600) { 
        if (!polygonCoords || polygonCoords.length < 3) {
            console.error('Polygon has too few coordinates to calculate zoom.');
            return 10; 
        }
        try {
            const turfPolygon = turf.polygon([polygonCoords]);
            const bbox = turf.bbox(turfPolygon); 

            const WORLD_DIM = { height: 256, width: 256 }; 
            const ZOOM_MAX = 21; 

            function latRad(lat) {
                const sin = Math.sin(lat * Math.PI / 180);
                const radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
                return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
            }

            function calculateZoom(mapPx, worldPx, fraction) {
                if (fraction === 0) return ZOOM_MAX; 
                return Math.floor(Math.log(mapPx / worldPx / fraction) / Math.LN2);
            }

            const latFraction = (latRad(bbox[3]) - latRad(bbox[1])) / Math.PI;
            const lngFraction = (bbox[2] - bbox[0]) / 360;

            const effectiveLatFraction = latFraction <= 0 ? 0.000001 : latFraction; 
            const effectiveLngFraction = lngFraction <= 0 ? 0.000001 : lngFraction;

            const expectedLatZoom = calculateZoom(mapHeightPx, WORLD_DIM.height, effectiveLatFraction);
            const expectedLngZoom = calculateZoom(mapWidthPx, WORLD_DIM.width, effectiveLngFraction);

            let zoom = Math.min(expectedLatZoom, expectedLngZoom, ZOOM_MAX);
            
            return Math.max(1, Math.min(zoom, 18)); 
        } catch (error) {
            console.error('Error calculating zoom level:', error);
            return 10; 
        }
    }
    _getWarningColor(eventType) {
        const eventTypeNormalized = eventType.toLowerCase().trim();
        const colorMap = NWS_EVENT_COLORS;

        return colorMap[eventTypeNormalized] || '#808080'; 
    }
    _formatExpiresTime(expiresStr) {
        if (!expiresStr) {
            return 'N/A';
        }
        try {
            const dateObj = new Date(expiresStr);
            
            const timePart = dateObj.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit', 
                hour12: true, 
                timeZoneName: 'short' 
            });
            
            const datePart = dateObj.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            });
            
            return `${timePart} ${datePart}`; 

        } catch (error) {
            console.error('Error formatting expires time:', expiresStr, error);
            return expiresStr; 
        }
    }
    _extractAffectedAreas(warningData) { return warningData.affectedAreasDescription || 'N/A'; }
    _extractHazardsFromDescription(warningData) {
        if (!warningData) {
            return 'Hazard details not available.';
        }

        let extractedHazards = [];
        const description = warningData.description || "";
        const parameters = warningData.cap?.parameters || []; 

        for (const param of parameters) {
            const valueNameLower = param.valueName?.toLowerCase();
            if (valueNameLower === 'maxhailsize' && param.value) {
                extractedHazards.push(`Hail up to ${param.value} inches`);
            }
            else if (valueNameLower === 'maxwindgust' && param.value) {
                const windMph = Math.round(parseFloat(param.value) * 1.15078);
                extractedHazards.push(`Wind gusts up to ${windMph} MPH`);
            }
        }

        if (description) {
            const hazardSectionMatch = description.match(/HAZARD\.\.\.(.*?)(?:IMPACT\.\.\.|SOURCE\.\.\.|$)/is);
            if (hazardSectionMatch && hazardSectionMatch[1]) {
                let hazardText = hazardSectionMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
                if (hazardText) {
                    const maxLength = 150;
                    extractedHazards.push(hazardText.length > maxLength ? hazardText.substring(0, maxLength - 3) + "..." : hazardText);
                }
            }
        }

        if (extractedHazards.length > 0) {
            extractedHazards = [...new Set(extractedHazards)]; 
            return extractedHazards.join(', ');
        }

        if (warningData.headline) {
            const maxLength = 120;
            let headlineText = warningData.headline;
            return headlineText.length > maxLength ? headlineText.substring(0, maxLength - 3) + "..." : headlineText;
        }

        return 'See alert details for hazards.'; 
    }
}

// Export the service
// module.exports = ImageGeneratorService;
// Or for ES6 modules: export default ImageGeneratorService;

// Example Usage (for testing, to be called from your XMPP server code)
/*
async function test() {
    const service = new ImageGeneratorService();
    const sampleWarningData = {
        id: 'test-warn-123',
        event: 'Tornado Warning',
        headline: 'Tornado Warning for Central County',
        description: 'A tornado warning is in effect. HAZARD...Tornado. SOURCE...Radar indicated. IMPACT...Flying debris will be dangerous.',
        instruction: 'Take shelter now!',
        severity: 'Extreme',
        certainty: 'Observed',
        urgency: 'Immediate',
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 3600 * 1000).toISOString(),
        sent: new Date().toISOString(),
        areaDesc: 'Central County, North Town',
        polygon: [ 
            [-85.0, 35.0], [-85.0, 35.1], [-84.9, 35.1], [-84.9, 35.0], [-85.0, 35.0]
        ],
        NWSheadline: 'TORNADO WARNING'
    };
    const imageFile = await service.generateMapImage(sampleWarningData, 'test_map.png');
    if (imageFile) {
        console.log('Generated image:', imageFile);
    } else {
        console.log('Failed to generate image.');
    }
}
// test();
*/
