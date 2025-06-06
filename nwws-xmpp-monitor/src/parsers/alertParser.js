import { RawParser } from './rawParser.js';
import { VtecParser } from './vtecParser.js';
import { UgcParser } from './ugcParser.js';
import definitions from './parser_config.js'; // Fixed import

const rawParser = new RawParser();
const vtecParser = new VtecParser();
const ugcParser = new UgcParser();

// Helper to find CAP alert info
// capAlertElement can be an @xmpp/xml Element or a JavaScript object from xml2js
function parseCapAlertDetails(capAlertElement, logger) {
    if (!capAlertElement) return {};

    const details = {};
    details.capPolygons = []; // Initialize for storing polygon strings
    details.capUgcCodes = []; // Initialize for storing UGC codes from CAP XML
    // Heuristic: if no getChild method, assume it's an xml2js plain object
    const isXmlJs = typeof capAlertElement.getChild !== 'function';

    if (isXmlJs) {
        // Handling for xml2js object
        details.sender = capAlertElement.sender;
        details.sent = capAlertElement.sent;
        details.status = capAlertElement.status;
        details.msgType = capAlertElement.msgType;
        details.scope = capAlertElement.scope;

        // --- BEGIN DEBUG LOGGING --- 
        logger.debug({ capAlertElement }, `AlertParser (xml2js) DEBUG: capAlertElement received`);
        logger.debug(`AlertParser (xml2js) DEBUG: typeof capAlertElement.info: ${typeof capAlertElement.info}`);
        logger.debug(`AlertParser (xml2js) DEBUG: capAlertElement.hasOwnProperty('info'): ${capAlertElement.hasOwnProperty('info')}`);
        // --- END DEBUG LOGGING --- 

        // CAP spec allows multiple <info> blocks. xml2js default behavior (without explicitArray:false)
        // will make it an object if one, array if multiple. We should handle both.
        const infoBlocks = Array.isArray(capAlertElement.info) ? capAlertElement.info : [capAlertElement.info].filter(Boolean);
        
        if (infoBlocks.length === 0) {
            logger.debug(`AlertParser (xml2js): No 'info' blocks found in capAlertElement.`);
        } else {
            logger.debug(`AlertParser (xml2js): Processing ${infoBlocks.length} info block(s).`);
        }

        infoBlocks.forEach((infoData, index) => {
            if (!infoData) {
                logger.debug(`AlertParser (xml2js): Info block at index ${index} is null/undefined, skipping.`);
                return;
            }
            logger.debug({ infoData: infoData }, `AlertParser (xml2js): Processing info block ${index + 1}.`);

            // Populate details from the first info block for simplicity for most fields, unless already populated
            logger.debug(`AlertParser (xml2js) DEBUG: Before attempting to set senderName: details.senderName is '${details.senderName}', infoData.senderName is '${infoData.senderName}'`);
            if (!details.senderName && infoData.senderName) {
                details.senderName = infoData.senderName;
                logger.debug(`AlertParser (xml2js) DEBUG: Set details.senderName to '${details.senderName}' from infoData.`);
            } else if (details.senderName) {
                logger.debug(`AlertParser (xml2js) DEBUG: details.senderName ('${details.senderName}') already set, not overwriting from infoData.senderName ('${infoData.senderName}').`);
            } else if (!infoData.senderName) {
                logger.debug(`AlertParser (xml2js) DEBUG: infoData.senderName is falsy ('${infoData.senderName}'), cannot set details.senderName.`);
            }

            if (!details.event) details.event = infoData.event;
            if (!details.urgency) details.urgency = infoData.urgency;
            if (!details.severity) details.severity = infoData.severity;
            if (!details.certainty) details.certainty = infoData.certainty;
            if (!details.effective) details.effective = infoData.effective;
            if (!details.onset) details.onset = infoData.onset;
            if (!details.expires) details.expires = infoData.expires;
            if (!details.headline) details.headline = infoData.headline;
            if (!details.description) details.description = infoData.description;
            if (!details.instruction) details.instruction = infoData.instruction;

            const areaBlocks = Array.isArray(infoData.area) ? infoData.area : [infoData.area].filter(Boolean);
            if (areaBlocks.length === 0) {
                logger.debug(`AlertParser (xml2js): Info block ${index + 1} has no 'area' blocks.`);
            } else {
                logger.debug(`AlertParser (xml2js): Info block ${index + 1} has ${areaBlocks.length} area block(s).`);
            }

            areaBlocks.forEach((areaData, areaIndex) => {
                if (!areaData) {
                    logger.debug(`AlertParser (xml2js): Area block at index ${areaIndex} (info ${index+1}) is null/undefined, skipping.`);
                    return;
                }
                logger.debug({ areaData: areaData }, `AlertParser (xml2js): Processing area block ${areaIndex + 1} from info block ${index + 1}.`);

                if (!details.areaDesc && areaData.areaDesc) details.areaDesc = areaData.areaDesc; // Take first areaDesc
                
                // Extract UGCs from geocode elements
                const geocodeBlocks = Array.isArray(areaData.geocode) ? areaData.geocode : [areaData.geocode].filter(Boolean);
                geocodeBlocks.forEach(geo => {
                    if (geo && geo.valueName && geo.value && (geo.valueName.toUpperCase() === 'UGC' || geo.valueName.toUpperCase() === 'FIPS6')) {
                        // Split value in case multiple codes are space-separated (though typically one per geocode)
                        const codes = geo.value.split(/\\s+/);
                        codes.forEach(code => {
                            if (code && !details.capUgcCodes.includes(code)) {
                                details.capUgcCodes.push(code);
                                logger.debug(`AlertParser (xml2js): Added UGC '${code}' from geocode (${geo.valueName}).`);
                            }
                        });
                    }
                });

                const polygonStrings = Array.isArray(areaData.polygon) ? areaData.polygon : [areaData.polygon].filter(Boolean);
                if (polygonStrings.length === 0) {
                    logger.debug(`AlertParser (xml2js): Area block ${areaIndex + 1} (info ${index+1}) has no 'polygon' strings.`);
                } else {
                    logger.debug(`AlertParser (xml2js): Area block ${areaIndex + 1} (info ${index+1}) has ${polygonStrings.length} polygon string(s).`);
                }

                polygonStrings.forEach(polyStr => {
                    if (polyStr && typeof polyStr === 'string') {
                        logger.debug(`AlertParser (xml2js): Found polygon string: "${polyStr.substring(0,50)}..."`);
                        details.capPolygons.push(polyStr.trim());
                    } else {
                        logger.warn({ alertId: id, polygonEntry: polyStr }, `AlertParser (xml2js): Encountered non-string or null polygon entry`);
                    }
                });
            });

            if (infoData.parameter) {
                const parametersRaw = Array.isArray(infoData.parameter) ? infoData.parameter : [infoData.parameter];
                if (!details.parameters) details.parameters = [];
                parametersRaw.forEach(p => {
                    if (p && p.valueName && p.value) {
                        details.parameters.push({ valueName: p.valueName, value: p.value });
                        // Check for UGCs in parameters
                        if (p.valueName.toUpperCase() === 'UGC') {
                            const codes = p.value.split(/\\s+/);
                            codes.forEach(code => {
                                if (code && !details.capUgcCodes.includes(code)) {
                                    details.capUgcCodes.push(code);
                                    logger.debug(`AlertParser (xml2js): Added UGC '${code}' from parameter (${p.valueName}).`);
                                }
                            });
                        }
                    }
                });
            } else if (!details.parameters) {
                details.parameters = [];
            }
        });

    } else {
        // Handling for @xmpp/xml element (original logic)
        logger.debug('AlertParser (@xmpp/xml): Using @xmpp/xml parsing path.');
        details.sender = capAlertElement.getChildText('sender');
        details.sent = capAlertElement.getChildText('sent');
        details.status = capAlertElement.getChildText('status');
        details.msgType = capAlertElement.getChildText('msgType');
        details.scope = capAlertElement.getChildText('scope');

        const infoElements = capAlertElement.getChildren('info');
        if (!infoElements || infoElements.length === 0) {
            logger.debug(`AlertParser (@xmpp/xml): No 'info' elements found.`);
        } else {
            logger.debug(`AlertParser (@xmpp/xml): Processing ${infoElements.length} info element(s).`);
        }

        infoElements.forEach((infoElement, index) => {
            if (!infoElement) return;
            // Populate details from the first info block for simplicity for most fields
            if (!details.event) details.event = infoElement.getChildText('event');
            if (!details.urgency) details.urgency = infoElement.getChildText('urgency');
            if (!details.severity) details.severity = infoElement.getChildText('severity');
            if (!details.certainty) details.certainty = infoElement.getChildText('certainty');
            if (!details.effective) details.effective = infoElement.getChildText('effective');
            if (!details.onset) details.onset = infoElement.getChildText('onset');
            if (!details.expires) details.expires = infoElement.getChildText('expires');
            if (!details.headline) details.headline = infoElement.getChildText('headline');
            if (!details.description) details.description = infoElement.getChildText('description');
            if (!details.instruction) details.instruction = infoElement.getChildText('instruction');

            const areaElements = infoElement.getChildren('area');
            if (!areaElements || areaElements.length === 0) {
                logger.debug(`AlertParser (@xmpp/xml): Info element has no 'area' elements.`);
            } else {
                logger.debug(`AlertParser (@xmpp/xml): Info element has ${areaElements.length} area element(s).`);
            }

            areaElements.forEach(areaElement => {
                if (!areaElement) return;
                if (!details.areaDesc && areaElement.getChildText('areaDesc')) details.areaDesc = areaElement.getChildText('areaDesc'); // Take first areaDesc
                
                // Extract UGCs from geocode elements for @xmpp/xml
                const geocodeElements = areaElement.getChildren('geocode');
                geocodeElements.forEach(geoElement => {
                    const valueName = geoElement.getChildText('valueName');
                    const value = geoElement.getChildText('value');
                    if (valueName && value && (valueName.toUpperCase() === 'UGC' || valueName.toUpperCase() === 'FIPS6')) {
                        const codes = value.split(/\\s+/);
                        codes.forEach(code => {
                            if (code && !details.capUgcCodes.includes(code)) {
                                details.capUgcCodes.push(code);
                                logger.debug(`AlertParser (@xmpp/xml): Added UGC '${code}' from geocode (${valueName}).`);
                            }
                        });
                    }
                });

                const polygonElements = areaElement.getChildren('polygon');
                polygonElements.forEach(polyElement => {
                    const polyStr = polyElement.getText();
                    if (polyStr && typeof polyStr === 'string') {
                        details.capPolygons.push(polyStr.trim());
                    }
                });
            });

            const parameters = infoElement.getChildren('parameter');
            if (!details.parameters) details.parameters = [];
            parameters.forEach(p => {
                const valueName = p.getChildText('valueName');
                const value = p.getChildText('value');
                if (valueName && value) {
                    details.parameters.push({ valueName, value });
                    // Check for UGCs in parameters for @xmpp/xml
                    if (valueName.toUpperCase() === 'UGC') {
                        const codes = value.split(/\\s+/);
                        codes.forEach(code => {
                            if (code && !details.capUgcCodes.includes(code)) {
                                details.capUgcCodes.push(code);
                                logger.debug(`AlertParser (@xmpp/xml): Added UGC '${code}' from parameter (${valueName}).`);
                            }
                        });
                    }
                }
            });
        });
        if (!details.parameters) details.parameters = []; // Ensure it's an array if no parameters found
    }
    return details;
}

export function parseAlert(rawText, id, capAlertElement, logger) {
    logger.info(`AlertParser: Parsing alert ID: ${id}`);
    const alertData = {
        id,
        source: 'nwws-oi',
        raw_product_text: rawText, // Include the full raw text if needed downstream
    };

    try {
        const vtec = vtecParser.getVtec(rawText);
        if (vtec) alertData.vtec = vtec;

        // Prioritize UGC from CAP XML if available
        const capDetails = parseCapAlertDetails(capAlertElement, logger);
        if (capDetails.capUgcCodes && capDetails.capUgcCodes.length > 0) {
            alertData.ugc = { zones: capDetails.capUgcCodes, full_ugc_string: capDetails.capUgcCodes.join(' ') }; // Adapt as needed
            logger.info(`AlertParser: Populated UGC from CAP XML: ${capDetails.capUgcCodes.join(', ')}`);
        } else {
            // Fallback to raw text parsing if no UGCs found in CAP XML
            const ugcFromRaw = ugcParser.getUgc(rawText);
            if (ugcFromRaw) {
                alertData.ugc = ugcFromRaw;
                logger.info(`AlertParser: Populated UGC from raw text parser.`);
            } else {
                 logger.info(`AlertParser: No UGC found in CAP XML or by raw text parser.`);
            }
        }
        
        // Merge other details from capDetails into alertData
        // Avoid overwriting id, source, raw_product_text, vtec, ugc
        for (const key in capDetails) {
            if (key !== 'capUgcCodes' && capDetails.hasOwnProperty(key) && !alertData.hasOwnProperty(key)) {
                alertData[key] = capDetails[key];
            }
        }


        alertData.issuingOffice = rawParser.getOfficeName(rawText);
        
        // CAP XML specific parsing (original call to parseCapAlertDetails is now handled above for UGC)
        // const capDetails = parseCapAlertDetails(capAlertElement, logger); // Already called
        // Object.assign(alertData, capDetails); // Merged above selectively

        // If it's an 'Actual' message and type is 'Cancel', we might not need to process further
        if (alertData.cap && alertData.cap.msgType && alertData.cap.msgType.toLowerCase() === 'cancel') {
            logger.info(`AlertParser: Alert ID ${id} is a 'Cancel' message. Skipping further processing.`);
            return null;
        }

        // Initialize geometry as null
        alertData.geometry = null;

        // Attempt to get polygon from CAP details first
        if (capDetails.capPolygons && capDetails.capPolygons.length > 0) {
            const firstPolygonString = capDetails.capPolygons[0]; // Using the first polygon
            logger.info(`AlertParser: Found CAP polygon string for ${id}: ${firstPolygonString.substring(0,100)}...`);
            try {
                const coordinatePairs = firstPolygonString.split(' ').map(pairStr => {
                    const parts = pairStr.split(',');
                    // CAP is typically lat,lon. GeoJSON is lon,lat.
                    return [parseFloat(parts[1]), parseFloat(parts[0])]; 
                });
                
                // Ensure the polygon is closed for valid GeoJSON (first and last point are the same)
                if (coordinatePairs.length > 0 && 
                    (coordinatePairs[0][0] !== coordinatePairs[coordinatePairs.length - 1][0] || 
                     coordinatePairs[0][1] !== coordinatePairs[coordinatePairs.length - 1][1])) {
                    coordinatePairs.push([...coordinatePairs[0]]); // Close the polygon
                }

                if (coordinatePairs.length >= 4) { // A valid polygon needs at least 3 distinct points + closing point
                    alertData.geometry = {
                        type: "Polygon",
                        coordinates: [coordinatePairs] // GeoJSON Polygon coordinates are an array of linear rings
                    };
                    logger.info(`AlertParser: Successfully parsed CAP polygon for ${id}.`);
                } else {
                    logger.warn(`AlertParser: CAP polygon string for ${id} resulted in insufficient coordinate pairs after parsing: ${coordinatePairs.length}`);
                }
            } catch (e) {
                logger.error({ alertId: id, error: e.message, stack: e.stack }, `AlertParser: Error parsing CAP polygon string for ${id}: "${firstPolygonString}"`);
            }
        }

        // Fallback to raw text parsing if CAP polygon wasn't found or was invalid
        if (!alertData.geometry) {
            logger.info(`AlertParser: No valid CAP polygon for ${id}, trying raw text regex parser.`);
            const polygonFromRaw = rawParser.getPolygonCoordinatesByText(rawText);
            if (polygonFromRaw && polygonFromRaw.length > 0) {
                alertData.geometry = {
                    type: "Polygon",
                    coordinates: [polygonFromRaw] 
                };
                console.log(`AlertParser: Polygon found via raw text regex for ${id}.`);
            } else {
                console.log(`AlertParser: No polygon found via raw text regex for ${id} either.`);
            }
        }

        // Consolidate some top-level fields for convenience, if available from CAP
        alertData.event = capDetails.event || (vtec ? vtec.phenomena : 'Unknown Event');
        alertData.severity = capDetails.severity || (vtec ? vtec.significance : 'Unknown');
        alertData.headline = capDetails.headline;
        alertData.description = capDetails.description;
        alertData.instruction = capDetails.instruction;
        alertData.affectedAreasDescription = capDetails.areaDesc;

        // Check if the event should be ignored
        if (alertData.event && definitions.ignored_event_names && definitions.ignored_event_names.includes(alertData.event)) {
            logger.info(`AlertParser: Event "${alertData.event}" for ID ${id} is in the ignore list. Skipping.`);
            return null; // Indicate that this alert should be ignored
        }

    } catch (error) {
        logger.error({ alertId: id, error: error.message, stack: error.stack }, `AlertParser: Error parsing alert ID ${id}`);
        alertData.error = error.message;
    }

    // logger.info(`AlertParser: Parsed data for ${id}:`, JSON.stringify(alertData, null, 2));
    return alertData;
}