import { RawParser } from './rawParser.js';
import { UgcParser } from './ugcParser.js'; // UGC might be relevant for LSRs too
// VtecParser might not be directly relevant unless LSRs also use VTEC codes

const rawParser = new RawParser();
const ugcParser = new UgcParser();

export function parseStormReport(rawText, id, stormReportElement) {
    console.log(`StormReportParser: Parsing storm report ID: ${id}`);
    const reportData = {
        id,
        source: 'nwws-oi',
        type: 'Local Storm Report', // Default type for this parser
        raw_product_text: rawText,
    };

    try {
        // Storm reports (LSRs) are typically plain text.
        // We can use RawParser methods to extract information.
        // The structure of LSRs can vary, so these are examples.

        // Attempt to get UGC codes if present (some LSRs might have them)
        const ugc = ugcParser.getUgc(rawText);
        if (ugc) reportData.ugc = ugc;

        reportData.issuingOffice = rawParser.getOfficeName(rawText);

        // Example: Extract summary, location, time, source, remarks from LSR text
        // This requires defining patterns or keywords to look for.
        // For instance, LSRs often have lines like:
        // "SUMMARY.........HAIL"
        // "LOCATION........2 ENE SOMEWHERE"
        // "TIME............0300 PM"
        // "SOURCE..........TRAINED SPOTTER"
        // "REMARKS.........QUARTER SIZED HAIL."

        reportData.summary = rawParser.getStringByLine(rawText, 'SUMMARY.........') || rawParser.getStringByLine(rawText, 'SUMMARY:');
        reportData.eventLocation = rawParser.getStringByLine(rawText, 'LOCATION........') || rawParser.getStringByLine(rawText, 'LOCATION:');
        reportData.eventTime = rawParser.getStringByLine(rawText, 'TIME............') || rawParser.getStringByLine(rawText, 'TIME:');
        reportData.dataSource = rawParser.getStringByLine(rawText, 'SOURCE..........') || rawParser.getStringByLine(rawText, 'SOURCE:');
        reportData.remarks = rawParser.getStringByLine(rawText, 'REMARKS.........') || rawParser.getStringByLine(rawText, 'REMARKS:');

        // If stormReportElement is provided (e.g., if LSRs are wrapped in some specific XML by NWWS-OI),
        // you could add XML parsing logic here, similar to alertParser.
        // if (stormReportElement) { ... }

    } catch (error) {
        console.error(`StormReportParser: Error parsing storm report ${id}:`, error);
        reportData.error = error.message;
    }

    // console.log(`StormReportParser: Parsed data for ${id}:`, JSON.stringify(reportData, null, 2));
    return reportData;
}