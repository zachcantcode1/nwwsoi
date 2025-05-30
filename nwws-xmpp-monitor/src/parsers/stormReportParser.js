import { RawParser } from './rawParser.js';
import { UgcParser } from './ugcParser.js'; // UGC might be relevant for LSRs too
// VtecParser might not be directly relevant unless LSRs also use VTEC codes

const rawParser = new RawParser();
const ugcParser = new UgcParser();

// Helper to try multiple prefixes for a field
function extractFieldWithMultiplePrefixes(rawText, prefixes) {
    if (!rawText || !prefixes || !Array.isArray(prefixes)) return null;
    for (const prefix of prefixes) {
        const value = rawParser.getStringByLine(rawText, prefix);
        if (value) return value;
    }
    return null;
}

function parseTabularLsrData(rawText, reportData) {
    if (!rawText) return;
    console.log(`StormReportParser (Tabular): Attempting to parse tabular LSR data for ID: ${reportData.id}`);

    const lines = rawText.split('\n');
    let primaryDataLineIndex = -1;
    let rawLatStringForSearch = '';

    if (reportData.latitude) {
        rawLatStringForSearch = `${Math.abs(reportData.latitude).toFixed(2)}${reportData.latitude >= 0 ? 'N' : 'S'}`;
    }
    console.log(`StormReportParser (Tabular): Using eventTime='${reportData.eventTime}' and latStringSearch='${rawLatStringForSearch}' to find primary line.`);

    // Find the primary data line: must contain the eventTime and the characteristic latitude string.
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (reportData.eventTime && line.includes(reportData.eventTime) && 
            rawLatStringForSearch && line.includes(rawLatStringForSearch)) {
            primaryDataLineIndex = i;
            console.log(`StormReportParser (Tabular): Primary data line candidate (index ${i}): "${line}"`);
            break;
        }
    }
    
    // Fallback: if lat/lon wasn't found by rawParser, but time was, try finding line by time only.
    if (primaryDataLineIndex === -1 && reportData.eventTime) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
             if (line.trim().startsWith(reportData.eventTime) || line.includes(reportData.eventTime + " ")) {
                if (/[NS]\s+\d{1,3}\.\d+[EW]/.test(line) || /\d{1,2}\.\d+[NS]\s+\d{1,3}\.\d+[EW]/.test(line)) {
                    primaryDataLineIndex = i;
                    console.log(`StormReportParser (Tabular): Primary data line candidate (time prefix and coord pattern, index ${i}): "${line}"`);
                    break;
                }
            }
        }
    }

    if (primaryDataLineIndex === -1) {
        console.log(`StormReportParser (Tabular): Could not identify a primary tabular data line for ID: ${reportData.id}.`);
        return; // Can't proceed without the primary line
    }

    // --- Process Primary Line (Event, Location) --- 
    const primaryLine = lines[primaryDataLineIndex];
    let textToParseForEventLocation = primaryLine;

    if (reportData.eventTime && textToParseForEventLocation.includes(reportData.eventTime)) {
        textToParseForEventLocation = textToParseForEventLocation.substring(textToParseForEventLocation.indexOf(reportData.eventTime) + reportData.eventTime.length).trim();
    }
    
    let rawFullCoordString = '';
    if (reportData.latitude && reportData.longitude) {
        rawFullCoordString = `${Math.abs(reportData.latitude).toFixed(2)}${reportData.latitude >= 0 ? 'N' : 'S'} ${Math.abs(reportData.longitude).toFixed(2)}${reportData.longitude >= 0 ? 'E' : 'W'}`;
        const coordPatternInText = new RegExp(`(\d{1,2}\.\d+)([NS])\s+(\d{1,3}\.\d+)([EW])`);
        const coordMatchInLine = primaryLine.match(coordPatternInText);
        if(coordMatchInLine) {
            rawFullCoordString = coordMatchInLine[0]; // Use the exact matched string from the text
        }
    }

    if (rawFullCoordString && textToParseForEventLocation.includes(rawFullCoordString)) {
        textToParseForEventLocation = textToParseForEventLocation.substring(0, textToParseForEventLocation.lastIndexOf(rawFullCoordString)).trim();
    }
    
    console.log(`StormReportParser (Tabular): Text for Event/Location parsing: "${textToParseForEventLocation}"`);

    const eventTypesRegex = /^(TSTM WND GST|TSTM WND DMG|HAIL|FUNNEL CLOUD|TORNADO|FLASH FLOOD|MARINE TSTM WIND|WATERSPOUT|HEAVY RAIN|BLIZZARD|ICE STORM|HEAVY SNOW|DUST STORM|NON-TSTM WND GST|NON-TSTM WND DMG)/i;
    let eventMatch = textToParseForEventLocation.match(eventTypesRegex);
    if (eventMatch && eventMatch[0]) {
        if (!reportData.summary) reportData.summary = eventMatch[0].trim();
        let remainingText = textToParseForEventLocation.substring(eventMatch[0].length).trim();
        if (remainingText && !reportData.eventLocation) reportData.eventLocation = remainingText.replace(/\s\s+/g, ' ').trim();
        console.log(`StormReportParser (Tabular): Extracted by Regex - Event: "${reportData.summary}", Location: "${reportData.eventLocation}"`);
    } else {
        const parts = textToParseForEventLocation.split(/\s{2,}/).filter(p => p.length > 0);
        if (parts.length > 0) {
            if (parts.length > 1 && /^\d+\s+(N|S|E|W|NE|NW|SE|SW|MILE|MILES)/i.test(parts[parts.length - 1])) {
                if (!reportData.eventLocation) reportData.eventLocation = parts.pop().trim();
                if (parts.length > 0 && !reportData.summary) reportData.summary = parts.join(' ').trim();
            } else if (parts.length === 1) {
                 if (/^\d+\s+(N|S|E|W|NE|NW|SE|SW|MILE|MILES)/i.test(parts[0]) || /\b(COUNTY|CITY|PARK|LAKE|RIVER|RD|STREET|AVE|HWY|NEAR)\b/i.test(parts[0])) {
                    if (!reportData.eventLocation) reportData.eventLocation = parts[0].trim();
                 } else {
                    if (!reportData.summary) reportData.summary = parts[0].trim();
                 }
            } else if (parts.length > 1) {
                if (!reportData.summary) reportData.summary = parts.shift().trim();
                if (parts.length > 0 && !reportData.eventLocation) reportData.eventLocation = parts.join(' ').trim();
            }
            console.log(`StormReportParser (Tabular Fallback Split): Event: "${reportData.summary}", Location: "${reportData.eventLocation}"`);
        }
    }

    // --- Find and Process Second Actual Data Line (Magnitude, Source) --- 
    let secondLineActualIndex = -1;
    for (let i = primaryDataLineIndex + 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            secondLineActualIndex = i;
            break;
        }
    }
    console.log(`StormReportParser (Tabular): Second data line candidate index: ${secondLineActualIndex}`);

    if (secondLineActualIndex !== -1) {
        const secondLineContent = lines[secondLineActualIndex].trim();
        console.log(`StormReportParser (Tabular): Second data line content for Mag/Source: "${secondLineContent}"`);
        const secondLineParts = secondLineContent.split(/\s{2,}/).filter(p => p.length > 0);
        
        const magRegex = /(?:M|E)(\d+\.?\d*)\s*(MPH|INCH|KTS)/i;
        const magMatch = secondLineContent.match(magRegex);
        if (magMatch && !reportData.magnitude) {
            reportData.magnitude = magMatch[0];
            console.log(`StormReportParser (Tabular): Extracted Magnitude: "${reportData.magnitude}"`);
        }

        if (secondLineParts.length > 0) {
            // Source is often the last significant part, but avoid taking date/time or state codes if they are last due to splitting
            let potentialSource = '';
            for (let k = secondLineParts.length - 1; k >= 0; k--) {
                const part = secondLineParts[k];
                if (part && part.length > 1 && isNaN(part) && !/^[A-Z]{2}$/.test(part) && !part.includes('/') && !part.includes(':') && !magRegex.test(part)) {
                    potentialSource = part;
                    break;
                }
            }
            if (potentialSource && !reportData.dataSource) {
                 reportData.dataSource = potentialSource;
                 console.log(`StormReportParser (Tabular): Extracted Source: "${reportData.dataSource}"`);
            }
        }
    }

    // --- Find and Process Remarks --- 
    let remarksText = [];
    let actualRemarksLineFound = false;
    let remarksSearchStartIndex = (secondLineActualIndex !== -1) ? secondLineActualIndex + 1 : primaryDataLineIndex + 1;
    let firstNonEmptyLineForRemarksIndex = -1;

    for (let i = remarksSearchStartIndex; i < lines.length; i++) {
        if (lines[i].trim()) {
            firstNonEmptyLineForRemarksIndex = i;
            break;
        }
    }
    console.log(`StormReportParser (Tabular): Starting remarks search from effective index: ${firstNonEmptyLineForRemarksIndex}`);

    if (firstNonEmptyLineForRemarksIndex !== -1) {
        for (let i = firstNonEmptyLineForRemarksIndex; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            if (trimmedLine === '&&' || trimmedLine === '$$' || /^\d{3,}$/.test(trimmedLine) || /NWUS\d{2}/.test(trimmedLine) || /^KML$/.test(trimmedLine)) {
                console.log(`StormReportParser (Tabular): Detected report end marker "${trimmedLine}", stopping remarks.`);
                break;
            }

            if (!actualRemarksLineFound) { 
                if (trimmedLine) { 
                    if (line.startsWith("            ") || line.startsWith("          ") || trimmedLine.startsWith("..") || 
                        (i === firstNonEmptyLineForRemarksIndex && 
                         !/^\.\.TIME\.\.\./.test(trimmedLine) && 
                         !/^\d{4}\s+(AM|PM|Z)/.test(trimmedLine) && 
                         !/^[A-Z]{2}[CZ][0-9]{3}/.test(trimmedLine) && 
                         !(reportData.eventTime && line.includes(reportData.eventTime)) && 
                         !trimmedLine.match(/(\d{1,2}\.\d+)([NS])\s+(\d{1,3}\.\d+)([EW])/) &&
                         !trimmedLine.match(/(?:M|E)(\d+\.?\d*)\s*(MPH|INCH|KTS)/i) && // Not a magnitude line
                         !lines[primaryDataLineIndex].includes(trimmedLine) && // Not part of the primary line text
                         !(secondLineActualIndex !== -1 && lines[secondLineActualIndex].includes(trimmedLine)) // Not part of the second data line text
                        )
                       ) {
                        remarksText.push(trimmedLine.replace(/^\.\.\s*/, ''));
                        actualRemarksLineFound = true;
                        console.log(`StormReportParser (Tabular): Found first remark line: "${trimmedLine}"`);
                    } else if (i === firstNonEmptyLineForRemarksIndex) {
                        console.log(`StormReportParser (Tabular): First non-empty line after mag/source ("${trimmedLine}") did not match remark criteria.`);
                        break;
                    }
                }
            } else { 
                if (trimmedLine) {
                    remarksText.push(trimmedLine.replace(/^\.\.\s*/, ''));
                } else {
                    if (remarksText.length > 0) {
                         // Allow one blank line within remarks, but break on two consecutive blanks or if it's just padding.
                        if (i + 1 < lines.length && lines[i+1].trim()) {
                            // Next line has content, so this is likely an intentional paragraph break
                            remarksText.push(''); // Add the blank line for formatting if desired, or just continue
                        } else {
                            console.log("StormReportParser (Tabular): Ending remarks due to blank line(s).");
                            break; 
                        }
                    }
                }
            }
        }
    }
    
    if (remarksText.length > 0) {
        if (!reportData.remarks) reportData.remarks = remarksText.join(' ').replace(/\s\s+/g, ' ').trim();
        console.log(`StormReportParser (Tabular): Extracted Remarks: "${reportData.remarks}"`);
    }
}

// --- XML Helper Functions ---
function _getElementText(element, childName, isXmlJs, defaultValue = null) {
    if (!element) return defaultValue;
    let child;
    if (isXmlJs) {
        child = element[childName];
        if (child === undefined) return defaultValue;
        // Handle cases where xml2js might make it an array for a single element
        if (Array.isArray(child)) {
            // If array is empty or first element is undefined, return default
            if (child.length === 0 || child[0] === undefined) return defaultValue;
            // If the child element is an object with a '_' property for its text value
            if (typeof child[0] === 'object' && child[0] !== null && '_' in child[0]) {
                return child[0]._;
            }
            // Otherwise, assume the first element is the text value itself
            return child[0]; 
        }
        // If not an array, handle object with '_' or direct value
        if (typeof child === 'object' && child !== null && '_' in child) {
            return child._;
        }
        return child; // Direct value
    } else {
        // @xmpp/xml element
        child = element.getChild(childName);
        return child ? child.text() : defaultValue;
    }
}

// Add more helpers like _getChildElement or _getChildElements if complex structures are needed.
// For now, _getElementText should cover simple text extraction from direct children.
// --- End XML Helper Functions ---

export function parseStormReport(rawText, id, stormReportElement) {
    console.log(`StormReportParser: Parsing storm report ID: ${id}`);
    // Log the raw text for debugging (first 500 chars)
    console.log(`StormReportParser: Raw text for ${id} (first 500 chars):\n${rawText ? rawText.substring(0, 500) : 'N/A'}...`);

    const reportData = {
        id,
        source: 'nwws-oi',
        type: 'Local Storm Report', // Default type for this parser
        raw_product_text: rawText,
        magnitude: null,
    };

    try {
        const isXmlJs = stormReportElement && typeof stormReportElement.getChild !== 'function';

        if (stormReportElement) {
            console.log(`StormReportParser: stormReportElement provided. Type: ${isXmlJs ? 'xml2js object' : '@xmpp/xml element'}`);
            // Attempt to parse from XML structure first
            reportData.summary = _getElementText(stormReportElement, 'summary', isXmlJs, reportData.summary);
            reportData.eventLocation = _getElementText(stormReportElement, 'location', isXmlJs) || _getElementText(stormReportElement, 'eventLocation', isXmlJs, reportData.eventLocation);
            reportData.eventTime = _getElementText(stormReportElement, 'time', isXmlJs) || _getElementText(stormReportElement, 'eventTime', isXmlJs, reportData.eventTime);
            reportData.dataSource = _getElementText(stormReportElement, 'source', isXmlJs) || _getElementText(stormReportElement, 'dataSource', isXmlJs, reportData.dataSource);
            reportData.remarks = _getElementText(stormReportElement, 'remarks', isXmlJs, reportData.remarks);
            reportData.issuingOffice = _getElementText(stormReportElement, 'office', isXmlJs) || _getElementText(stormReportElement, 'issuingOffice', isXmlJs, reportData.issuingOffice);
            
            const xmlLatitude = _getElementText(stormReportElement, 'latitude', isXmlJs);
            const xmlLongitude = _getElementText(stormReportElement, 'longitude', isXmlJs);
            if (xmlLatitude !== null && xmlLongitude !== null) {
                reportData.latitude = parseFloat(xmlLatitude);
                reportData.longitude = parseFloat(xmlLongitude);
                console.log(`StormReportParser: Extracted coordinates from XML for ${id}: Lat ${reportData.latitude}, Lon ${reportData.longitude}`);
            }

            const xmlUgc = _getElementText(stormReportElement, 'ugc', isXmlJs);
            if (xmlUgc) reportData.ugc = xmlUgc;
        }

        // Fallback or supplement with RawParser for fields not found or if no XML element
        // Storm reports (LSRs) are typically plain text.
        // We can use RawParser methods to extract information.
        // The structure of LSRs can vary, so these are examples.

        // Attempt to get UGC codes if present (some LSRs might have them)
        if (!reportData.ugc) {
            const ugcFromRaw = ugcParser.getUgc(rawText);
            if (ugcFromRaw) reportData.ugc = ugcFromRaw;
        }

        if (!reportData.issuingOffice) {
            reportData.issuingOffice = rawParser.getOfficeName(rawText);
        }

        // Example: Extract summary, location, time, source, remarks from LSR text
        // This requires defining patterns or keywords to look for.
        // For instance, LSRs often have lines like:
        // "SUMMARY.........HAIL"
        // "LOCATION........2 ENE SOMEWHERE"
        // "TIME............0300 PM"
        // "SOURCE..........TRAINED SPOTTER"
        // "REMARKS.........QUARTER SIZED HAIL."

        const summaryPrefixes = ['SUMMARY.........', 'SUMMARY:', 'EVENT SUMMARY:', 'REPORT SUMMARY:'];
        const locationPrefixes = ['LOCATION........', 'LOCATION:', 'EVENT LOCATION:'];
        const timePrefixes = ['TIME............', 'TIME:', 'EVENT TIME:'];
        const sourcePrefixes = ['SOURCE..........', 'SOURCE:', 'DATA SOURCE:'];
        const remarksPrefixes = ['REMARKS.........', 'REMARKS:', 'ADDITIONAL INFORMATION:'];

        if (!reportData.summary) {
            reportData.summary = extractFieldWithMultiplePrefixes(rawText, summaryPrefixes);
        }
        if (!reportData.eventLocation) {
            reportData.eventLocation = extractFieldWithMultiplePrefixes(rawText, locationPrefixes);
        }
        
        if (!reportData.eventTime) {
            // Try to get time from tabular format first
            reportData.eventTime = rawParser.getTabularLsrEventTime(rawText);
            // Fallback to dedicated TIME line if tabular time not found
            if (!reportData.eventTime) {
                reportData.eventTime = extractFieldWithMultiplePrefixes(rawText, timePrefixes);
            }
        }

        if (!reportData.dataSource) {
            reportData.dataSource = extractFieldWithMultiplePrefixes(rawText, sourcePrefixes);
        }
        if (!reportData.remarks) {
            reportData.remarks = extractFieldWithMultiplePrefixes(rawText, remarksPrefixes);
        }

        // Attempt to extract single point coordinates from raw text if not found in XML
        if (reportData.latitude === undefined || reportData.longitude === undefined) {
            const coordinatesFromRaw = rawParser.getSinglePointCoordinates(rawText);
            if (coordinatesFromRaw) {
                reportData.latitude = coordinatesFromRaw.latitude;
                reportData.longitude = coordinatesFromRaw.longitude;
                console.log(`StormReportParser: Extracted coordinates from RAW TEXT for ${id}: Lat ${reportData.latitude}, Lon ${reportData.longitude}`);
            } else {
                console.log(`StormReportParser: No direct coordinates found in XML or RAW TEXT for ${id}. Location: "${reportData.eventLocation}". Geocoding might be needed.`);
            }
        }

        // If stormReportElement is provided (e.g., if LSRs are wrapped in some specific XML by NWWS-OI),
        // you could add XML parsing logic here, similar to alertParser.
        // XML parsing logic is now above, integrated with fallbacks.

    } catch (error) {
        console.error(`StormReportParser: Error parsing storm report ${id}:`, error);
        reportData.error = error.message;
    }

    // If critical fields are still missing, attempt to parse as tabular LSR
    if (rawText && (!reportData.summary || !reportData.eventLocation || !reportData.dataSource || !reportData.remarks)) {
        console.log(`StormReportParser: Some fields still missing for ${id}. Attempting tabular parse.`);
        parseTabularLsrData(rawText, reportData); // Pass the existing reportData to be further populated
    }

    console.log(`StormReportParser: Parsed data for ${id}:`, JSON.stringify(reportData, null, 2));
    return reportData;
}