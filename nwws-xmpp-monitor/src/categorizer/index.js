import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const xmppXml = require('@xmpp/xml'); // Keep for stanza parsing
const xml2js = require('xml2js'); // New: For rawText parsing

// --- Top-Level xmppXml Diagnostics (can be removed later if not needed) ---
console.log("DEBUG categorizer: --- Top-Level xmppXml Diagnostics ---");
console.log("DEBUG categorizer: typeof xmppXml:", typeof xmppXml);
if (typeof xmppXml === 'function') {
    console.log("DEBUG categorizer: xmppXml is a function. Properties:", Object.getOwnPropertyNames(xmppXml));
} else if (typeof xmppXml === 'object' && xmppXml !== null) {
    console.log("DEBUG categorizer: xmppXml is an object. Keys:", Object.keys(xmppXml));
}
console.log("DEBUG categorizer: typeof xmppXml.parse:", typeof xmppXml?.parse);
console.log("DEBUG categorizer: typeof xmppXml.default:", typeof xmppXml?.default);
if (xmppXml?.default) {
    console.log("DEBUG categorizer: typeof xmppXml.default.parse:", typeof xmppXml.default.parse);
}
console.log("DEBUG categorizer: --- End Top-Level xmppXml Diagnostics ---");

// xml2js parser instance
const xml2jsParser = new xml2js.Parser({ explicitRoot: true, explicitArray: false });

// Helper function to find CAP alert element (for @xmpp/xml elements)
function findCapAlert(element) {
    if (!element || typeof element === 'string') {
        return null;
    }
    if (element.name === 'alert' && element.attrs.xmlns && element.attrs.xmlns.startsWith('urn:oasis:names:tc:emergency:cap:')) {
        return element;
    }
    if (element.children && Array.isArray(element.children)) {
        for (const child of element.children) {
            const found = findCapAlert(child);
            if (found) return found;
        }
    }
    return null;
}

const IGNORED_EVENT_TYPES = ["Test Message", "Small Craft Advisory", "Severe Thunderstorm Watch"];

export async function categorizeMessage(rawText, id, stanza) {
    console.log('Categorizer: Received stanza for categorization. Stanza name:', stanza?.name);
    let capAlertElement = null;

    if (stanza) {
        try {
            // Add detailed logging for stanza structure if needed later
            // console.log(`Categorizer: Attempting to find CAP alert in stanza for ID ${id}. Stanza name: ${stanza.name}`);
            capAlertElement = findCapAlert(stanza);
            if (capAlertElement) {
                // console.log(`Categorizer: CAP alert found in stanza for ID ${id}.`);
            }
        } catch (e) {
            console.warn(`Categorizer: Error while searching CAP in stanza for ID ${id}:`, e.message);
        }
    }

    // If not found in stanza, try to parse from rawText
    if (!capAlertElement && rawText) {
        try {
            const xmlDeclaration = '<?xml';
            const xmlStartIndex = rawText.indexOf(xmlDeclaration);

            if (xmlStartIndex !== -1) {
                const xmlString = rawText.substring(xmlStartIndex);
                console.log(`Categorizer: Attempting to parse XML from rawText using xml2js for ID ${id}`);
                try {
                    // Use xml2js.parseStringPromise for async/await
                    const parsedJsObject = await xml2jsParser.parseStringPromise(xmlString);
                    console.log(`Categorizer: xml2js parsed rawText for ID ${id}. Type: ${typeof parsedJsObject}`);

                    if (parsedJsObject && parsedJsObject.alert && parsedJsObject.alert.$ && parsedJsObject.alert.$.xmlns === 'urn:oasis:names:tc:emergency:cap:1.2') {
                        console.log(`Categorizer: CAP alert identified in rawText by xml2js for ID ${id}. Root element: alert, xmlns matched.`);
                        const actualCapData = parsedJsObject.alert._jsObject ? parsedJsObject.alert._jsObject : parsedJsObject.alert;
                        // console.log(`Categorizer: Full actual CAP data object for ID ${id} (from xml2js): ${JSON.stringify(actualCapData, null, 2)}`);
                        
                        // UGC Filtering Logic
                        const ugcFilterCodesEnv = process.env.UGC_FILTER_CODES;
                        if (ugcFilterCodesEnv) {
                            const filterCodes = ugcFilterCodesEnv.split(',').map(code => code.trim());
                            let alertUgcCodes = [];
                            const infoBlocks = Array.isArray(actualCapData.info) ? actualCapData.info : [actualCapData.info];

                            infoBlocks.forEach(info => {
                                if (info && info.area) {
                                    const areaBlocks = Array.isArray(info.area) ? info.area : [info.area];
                                    areaBlocks.forEach(area => {
                                        if (area && area.geocode) {
                                            const geocodes = Array.isArray(area.geocode) ? area.geocode : [area.geocode];
                                            geocodes.forEach(geo => {
                                                if (geo && geo.valueName === 'UGC' && geo.value) {
                                                    alertUgcCodes.push(geo.value);
                                                }
                                            });
                                        }
                                    });
                                }
                            });

                            const hasMatchingUgc = alertUgcCodes.some(alertUgc => filterCodes.includes(alertUgc));
                            console.log(`Categorizer UGC Filter (ID: ${id}): Alert UGCs: [${alertUgcCodes.join(', ')}]. Filter Active: Yes. Match Found: ${hasMatchingUgc}`);

                            if (!hasMatchingUgc && alertUgcCodes.length > 0) { // Only filter if alert has UGCs and none match
                                console.log(`Categorizer: CAP alert (ID: ${id}) filtered out by UGC. No matching UGC codes found.`);
                                return { category: 'cap_alert_filtered_ugc', capAlertElement: null };
                            } else if (alertUgcCodes.length === 0 && filterCodes.length > 0) {
                                console.log(`Categorizer: CAP alert (ID: ${id}) has no UGC codes, but UGC filter is active. Filtering out.`);
                                return { category: 'cap_alert_filtered_ugc_no_alert_codes', capAlertElement: null };
                            }
                        }
                        // End UGC Filtering Logic

                        capAlertElement = actualCapData;
                    } else if (parsedJsObject && parsedJsObject.alert) { 
                        console.log(`Categorizer: xml2js did NOT identify a CAP alert in parsed rawText for ID ${id}. Structure mismatch or missing xmlns.`);
                        if (parsedJsObject.alert.$) {
                            console.log(`Categorizer: xml2js parsedJsObject.alert.$: ${JSON.stringify(parsedJsObject.alert.$)}`);
                        } else if (parsedJsObject) {
                            console.log(`Categorizer: xml2js parsedJsObject keys: ${Object.keys(parsedJsObject)}`);
                        }
                    }
                } catch (parseError) {
                    console.error(`Categorizer: ERROR during xml2js.parseStringPromise for ID ${id}:`, parseError.message);
                    // console.error(parseError.stack); // Optional: full stack trace
                    capAlertElement = null;
                }
            }
        } catch (e) {
            console.warn(`Categorizer: General error in rawText CAP alert processing for ID ${id}:`, e.message);
            // console.error(e.stack); // Optional: full stack trace
        }
    }

    if (capAlertElement) {
        console.log('Categorizer: CAP Alert found. ID:', id);

        // Event Type Filtering
        let eventString = null;
        // Heuristic: if no getChild method, assume it's an xml2js plain object
        const isXmlJsObject = typeof capAlertElement.getChild !== 'function';

        if (isXmlJsObject) { // xml2js object (typically parsedJsObject.alert)
            const infoBlock = Array.isArray(capAlertElement.info) ? capAlertElement.info[0] : capAlertElement.info;
            if (infoBlock && typeof infoBlock.event === 'string') {
                eventString = infoBlock.event;
            }
        } else { // @xmpp/xml element
            const infoEl = capAlertElement.getChild('info');
            if (infoEl) {
                const eventEl = infoEl.getChild('event');
                if (eventEl) {
                    eventString = eventEl.text();
                }
            }
        }

        if (eventString && IGNORED_EVENT_TYPES.includes(eventString)) {
            console.log(`Categorizer: Ignoring CAP alert (ID: ${id}) due to event type: "${eventString}"`);
            return { category: 'cap_alert_ignored_event_type', eventType: eventString, capAlertElement: null }; 
        }
        // End Event Type Filtering

        return { category: 'alert', capAlertElement: capAlertElement };
    }

    // Storm report categorization
    if (rawText && rawText.toUpperCase().includes('PRELIMINARY LOCAL STORM REPORT')) {
        console.log('Categorizer: Storm Report keyword "PRELIMINARY LOCAL STORM REPORT" found in rawText. ID:', id);
        return { category: 'storm_report', capAlertElement: null };
    }
    // Fallback or alternative check for LSR in header (e.g., LSRNYC, LSRJAN)
    // This might need more specific parsing of the rawText's first few lines if implemented.
    // Example: if (rawText && /^[A-Z]{3}\s*NWUS5\d\s*[A-Z]{6}\s*LSR[A-Z]{3}/.test(rawText.substring(0, 100))) {
    //     console.log('Categorizer: LSR product header pattern found. ID:', id);
    //     return { category: 'storm_report', capAlertElement: null };
    // }

    console.log('Categorizer: Message type not identified as CAP alert or storm report. ID:', id);
    return { category: 'unknown_category', capAlertElement: null };
}