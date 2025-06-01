import { RawParser } from './rawParser.js';
import { VtecParser } from './vtecParser.js';
import { UgcParser } from './ugcParser.js';
import definitions from './parser_config.js'; // Fixed import

const rawParser = new RawParser();
const vtecParser = new VtecParser();
const ugcParser = new UgcParser();

// Helper to find CAP alert info
// capAlertElement can be an @xmpp/xml Element or a JavaScript object from xml2js
function parseCapAlertDetails(capAlertElement) {
    if (!capAlertElement) return {};

    const details = {};
    details.capPolygons = []; // Initialize for storing polygon strings
    // Heuristic: if no getChild method, assume it's an xml2js plain object
    const isXmlJs = typeof capAlertElement.getChild !== 'function';

    if (isXmlJs) {
        // Handling for xml2js object
        details.sender = capAlertElement.sender;
        details.sent = capAlertElement.sent;
        details.status = capAlertElement.status;
        details.msgType = capAlertElement.msgType;
        details.scope = capAlertElement.scope;

        // --- BEGIN DEBUG LOGGING (keep these for one more test run) --- 
        console.log(`AlertParser (xml2js) DEBUG: capAlertElement received:`, JSON.stringify(capAlertElement, null, 2));
        console.log(`AlertParser (xml2js) DEBUG: typeof capAlertElement.info:`, typeof capAlertElement.info);
        console.log(`AlertParser (xml2js) DEBUG: capAlertElement.hasOwnProperty('info'):`, capAlertElement.hasOwnProperty('info'));
        // --- END DEBUG LOGGING --- 

        // CAP spec allows multiple <info> blocks. xml2js default behavior (without explicitArray:false)
        // will make it an object if one, array if multiple. We should handle both.
        const infoBlocks = Array.isArray(capAlertElement.info) ? capAlertElement.info : [capAlertElement.info].filter(Boolean);
        
        if (infoBlocks.length === 0) {
            console.log(`AlertParser (xml2js): No 'info' blocks found in capAlertElement.`);
        } else {
            console.log(`AlertParser (xml2js): Processing ${infoBlocks.length} info block(s).`);
        }

        infoBlocks.forEach((infoData, index) => {
            if (!infoData) {
                console.log(`AlertParser (xml2js): Info block at index ${index} is null/undefined, skipping.`);
                return;
            }
            console.log(`AlertParser (xml2js): Processing info block ${index + 1}. Structure:`, JSON.stringify(infoData, null, 2));

            // Populate details from the first info block for simplicity for most fields, unless already populated
            console.log(`AlertParser (xml2js) DEBUG: Before attempting to set senderName: details.senderName is '${details.senderName}', infoData.senderName is '${infoData.senderName}'`);
            if (!details.senderName && infoData.senderName) {
                details.senderName = infoData.senderName;
                console.log(`AlertParser (xml2js) DEBUG: Set details.senderName to '${details.senderName}' from infoData.`);
            } else if (details.senderName) {
                console.log(`AlertParser (xml2js) DEBUG: details.senderName ('${details.senderName}') already set, not overwriting from infoData.senderName ('${infoData.senderName}').`);
            } else if (!infoData.senderName) {
                console.log(`AlertParser (xml2js) DEBUG: infoData.senderName is falsy ('${infoData.senderName}'), cannot set details.senderName.`);
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
                console.log(`AlertParser (xml2js): Info block ${index + 1} has no 'area' blocks.`);
            } else {
                console.log(`AlertParser (xml2js): Info block ${index + 1} has ${areaBlocks.length} area block(s).`);
            }

            areaBlocks.forEach((areaData, areaIndex) => {
                if (!areaData) {
                    console.log(`AlertParser (xml2js): Area block at index ${areaIndex} (info ${index+1}) is null/undefined, skipping.`);
                    return;
                }
                console.log(`AlertParser (xml2js): Processing area block ${areaIndex + 1} from info block ${index + 1}. Structure:`, JSON.stringify(areaData, null, 2));

                if (!details.areaDesc && areaData.areaDesc) details.areaDesc = areaData.areaDesc; // Take first areaDesc
                
                const polygonStrings = Array.isArray(areaData.polygon) ? areaData.polygon : [areaData.polygon].filter(Boolean);
                if (polygonStrings.length === 0) {
                    console.log(`AlertParser (xml2js): Area block ${areaIndex + 1} (info ${index+1}) has no 'polygon' strings.`);
                } else {
                    console.log(`AlertParser (xml2js): Area block ${areaIndex + 1} (info ${index+1}) has ${polygonStrings.length} polygon string(s).`);
                }

                polygonStrings.forEach(polyStr => {
                    if (polyStr && typeof polyStr === 'string') {
                        console.log(`AlertParser (xml2js): Found polygon string: "${polyStr.substring(0,50)}..."`);
                        details.capPolygons.push(polyStr.trim());
                    } else {
                        console.log(`AlertParser (xml2js): Encountered non-string or null polygon entry:`, polyStr);
                    }
                });
            });

            if (infoData.parameter) {
                const parametersRaw = Array.isArray(infoData.parameter) ? infoData.parameter : [infoData.parameter];
                if (!details.parameters) details.parameters = [];
                parametersRaw.forEach(p => {
                    if (p && p.valueName && p.value) {
                        details.parameters.push({ valueName: p.valueName, value: p.value });
                    }
                });
            } else if (!details.parameters) {
                details.parameters = [];
            }
        });

    } else {
        // Handling for @xmpp/xml element (original logic)
        details.sender = capAlertElement.getChildText('sender');
        details.sent = capAlertElement.getChildText('sent');
        details.status = capAlertElement.getChildText('status');
        details.msgType = capAlertElement.getChildText('msgType');
        details.scope = capAlertElement.getChildText('scope');

        const infoElements = capAlertElement.getChildren('info');
        console.log(`AlertParser (xml2js): Processing ${infoElements.length} info block(s). First info block structure:`, JSON.stringify(infoElements[0], null, 2));

        infoElements.forEach(infoElement => {
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
            console.log(`AlertParser (xml2js): Info block has ${areaElements.length} area block(s). First area block structure:`, JSON.stringify(areaElements[0], null, 2));
            
            areaElements.forEach(areaElement => {
                if (!areaElement) return;
                if (!details.areaDesc && areaElement.getChildText('areaDesc')) details.areaDesc = areaElement.getChildText('areaDesc'); // Take first areaDesc
                
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
                }
            });
        });
        if (!details.parameters) details.parameters = []; // Ensure it's an array if no parameters found
    }
    return details;
}

export function parseAlert(rawText, id, capAlertElement) {
    console.log(`AlertParser: Parsing alert ID: ${id}`);
    const alertData = {
        id,
        source: 'nwws-oi',
        raw_product_text: rawText, // Include the full raw text if needed downstream
    };

    try {
        const vtec = vtecParser.getVtec(rawText);
        if (vtec) alertData.vtec = vtec;

        const ugc = ugcParser.getUgc(rawText);
        if (ugc) alertData.ugc = ugc;

        alertData.issuingOffice = rawParser.getOfficeName(rawText);
        
        // CAP XML specific parsing
        // capAlertElement is now either an @xmpp/xml Element or the JS object from xml2js
        const capDetails = parseCapAlertDetails(capAlertElement);
        alertData.cap = capDetails;

        // Initialize geometry as null
        alertData.geometry = null;

        // Attempt to get polygon from CAP details first
        if (capDetails.capPolygons && capDetails.capPolygons.length > 0) {
            const firstPolygonString = capDetails.capPolygons[0]; // Using the first polygon
            console.log(`AlertParser: Found CAP polygon string for ${id}: ${firstPolygonString.substring(0,100)}...`);
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
                    console.log(`AlertParser: Successfully parsed CAP polygon for ${id}.`);
                } else {
                    console.warn(`AlertParser: CAP polygon string for ${id} resulted in insufficient coordinate pairs after parsing: ${coordinatePairs.length}`);
                }
            } catch (e) {
                console.error(`AlertParser: Error parsing CAP polygon string for ${id}: "${firstPolygonString}"`, e);
            }
        }

        // Fallback to raw text parsing if CAP polygon wasn't found or was invalid
        if (!alertData.geometry) {
            console.log(`AlertParser: No valid CAP polygon for ${id}, trying raw text regex parser.`);
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
            console.log(`AlertParser: Event "${alertData.event}" for ID ${id} is in the ignore list. Skipping.`);
            return null; // Indicate that this alert should be ignored
        }

    } catch (error) {
        console.error(`AlertParser: Error parsing alert ${id}:`, error);
        alertData.error = error.message;
    }

    // console.log(`AlertParser: Parsed data for ${id}:`, JSON.stringify(alertData, null, 2));
    return alertData;
}