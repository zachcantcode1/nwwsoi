import { RawParser } from './rawParser.js';
import { VtecParser } from './vtecParser.js';
import { UgcParser } from './ugcParser.js';

const rawParser = new RawParser();
const vtecParser = new VtecParser();
const ugcParser = new UgcParser();

// Helper function to get text content from an XML element
// This is a simplified helper. A robust solution would handle various XML complexities.
function getElementText(xmlElement, tagName) {
    if (!xmlElement || typeof xmlElement.getChildText !== 'function') {
        // If it's not an @xmpp/xml Element, or if we only have raw text,
        // we might need a different strategy or a dedicated XML parser.
        // For now, this is a placeholder for direct raw text searching if needed.
        // This part would ideally use a proper XML parser if xmlElement is a string.
        const match = xmlElement.toString().match(new RegExp(`<${tagName}[^>]*>([\s\S]*?)<\/${tagName}>`));
        return match ? match[1].trim() : null;
    }
    return xmlElement.getChildText(tagName) || null;
}

// Helper to find CAP alert info (assuming capAlert is an @xmpp/xml Element)
function parseCapAlertDetails(capAlertElement, rawTextFallback) {
    if (!capAlertElement && !rawTextFallback) return {};

    const details = {};
    const sourceElement = capAlertElement || rawTextFallback;

    details.sender = getElementText(sourceElement, 'sender');
    details.sent = getElementText(sourceElement, 'sent');
    details.status = getElementText(sourceElement, 'status');
    details.msgType = getElementText(sourceElement, 'msgType');
    details.scope = getElementText(sourceElement, 'scope');

    // Information within the <info> element
    const infoElement = capAlertElement ? capAlertElement.getChild('info') : null;
    const sourceInfoElement = infoElement || rawTextFallback; // Fallback for info fields too

    if (sourceInfoElement) {
        details.event = getElementText(sourceInfoElement, 'event');
        details.urgency = getElementText(sourceInfoElement, 'urgency');
        details.severity = getElementText(sourceInfoElement, 'severity');
        details.certainty = getElementText(sourceInfoElement, 'certainty');
        details.headline = getElementText(sourceInfoElement, 'headline');
        details.description = getElementText(sourceInfoElement, 'description');
        details.instruction = getElementText(sourceInfoElement, 'instruction');
        details.areaDesc = getElementText(sourceInfoElement, 'areaDesc');
        // Parameters can be multiple, might need specific parsing
        const parameters = capAlertElement?.getChild('info')?.getChildren('parameter');
        if (parameters && parameters.length > 0) {
            details.parameters = parameters.map(p => ({
                valueName: p.getChildText('valueName'),
                value: p.getChildText('value')
            }));
        } else {
            details.parameters = [];
        }
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
        const polygon = rawParser.getPolygonCoordinatesByText(rawText);
        if (polygon && polygon.length > 0) {
            alertData.geometry = {
                type: "Polygon",
                coordinates: [polygon] // GeoJSON Polygon coordinates are an array of linear rings
            };
        }

        // CAP XML specific parsing
        // If capAlertElement is provided (ideally an @xmpp/xml Element from the stanza),
        // use it. Otherwise, fall back to trying to parse rawText (less ideal).
        const capDetails = parseCapAlertDetails(capAlertElement, capAlertElement ? null : rawText);
        alertData.cap = capDetails;

        // Consolidate some top-level fields for convenience, if available from CAP
        alertData.event = capDetails.event || (vtec ? vtec.phenomena : 'Unknown Event');
        alertData.severity = capDetails.severity || (vtec ? vtec.significance : 'Unknown');
        alertData.headline = capDetails.headline;
        alertData.description = capDetails.description;
        alertData.instruction = capDetails.instruction;
        alertData.affectedAreasDescription = capDetails.areaDesc;

    } catch (error) {
        console.error(`AlertParser: Error parsing alert ${id}:`, error);
        alertData.error = error.message;
    }

    // console.log(`AlertParser: Parsed data for ${id}:`, JSON.stringify(alertData, null, 2));
    return alertData;
}