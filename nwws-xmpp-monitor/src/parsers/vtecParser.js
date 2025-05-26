import { definitions } from './parser_config.js';

export class VtecParser {
    constructor() {
        this.name = 'VtecParser';
        // console.log(`Successfully initialized ${this.name} module`);
    }

    /**
     * @function getVtec
     * @description Get the VTEC from the message. This will search for the VTEC in the message and return it as an object.
     * Additionally will get the WMO if found.
     * 
     * @param {string} message - The message to search in
     * @returns {object|null} Parsed VTEC object or null if not found.
     */
    getVtec(message) {
        if (!message) return null;
        const match = message.match(definitions.vtec_regexp);
        let vtec = {};

        if (match && match[0]) {
            // The VTEC string is usually enclosed in slashes, e.g., /O.NEW.../
            // match[0] would be the full match like "/O.NEW.KDMX.SV.W.0030.240521T2254Z-240521T2330Z/"
            // match[1] would be the content inside the parentheses from the regex, which is the VTEC string itself.
            const vtecString = match[1];
            if (!vtecString) return null;

            const splitVTEC = vtecString.split('.');
            if (splitVTEC.length < 7) return null; // Basic validation

            const vtecDates = splitVTEC[5].split('-'); // Corrected index for dates (was 6)
            if (vtecDates.length < 2) return null; // Expecting start and end time

            vtec.fullVtecString = vtecString;
            vtec.action = this.getEventStatus(splitVTEC[1]); // O.NEW -> NEW (Action)
            vtec.officeId = splitVTEC[2]; // KDMX (Office ID)
            vtec.phenomena = this.getEventName(splitVTEC[3]); // SV (Phenomena)
            vtec.significance = this.getEventSignificance(splitVTEC[4]); // W (Significance)
            vtec.eventTrackingNumber = splitVTEC[5].substring(0, splitVTEC[5].indexOf('.', 6) - 1); // 0030 (ETN)
            vtec.startTime = this.formatVtecDate(vtecDates[0]);
            vtec.endTime = this.formatVtecDate(vtecDates[1]);
            vtec.eventStatus = this.getEventStatus(splitVTEC[1]); // Redundant with action, but kept for compatibility if needed

            // Attempt to find WMO header as well
            const wmoMatch = message.match(definitions.wmo_regexp);
            if (wmoMatch && wmoMatch[0]) {
                vtec.wmoHeader = wmoMatch[0];
            }

            return vtec;
        }
        return null;
    }

    /**
     * @function getEventName (Phenomena)
     * @description Get the event name from the VTEC phenomena code.
     * @param {string} code - The VTEC phenomena code (e.g., 'SV')
     */
    getEventName(code) {
        return definitions.event_codes[code] || code; // Return code itself if not found
    }

    /**
     * @function getEventSignificance
     * @description Get the event significance from the VTEC significance code.
     * @param {string} code - The VTEC significance code (e.g., 'W')
     */
    getEventSignificance(code) {
        return definitions.event_types[code] || code;
    }

    /**
     * @function getEventStatus (Action)
     * @description Get the event status from the VTEC action code.
     * @param {string} code - The VTEC action code (e.g., 'NEW')
     */
    getEventStatus(code) {
        return definitions.status_signatures[code] || code;
    }

    /**
     * @function formatVtecDate
     * @description Format the VTEC date string (YYMMDDTHHMMZ) into a more standard ISO-like format or Date object.
     * @param {string} vtecDateStr - The VTEC date string (e.g., '240521T2254Z')
     * @returns {string} Formatted date string or original if format is unexpected.
     */
    formatVtecDate(vtecDateStr) {
        if (!vtecDateStr || vtecDateStr.length !== 13 || vtecDateStr[6] !== 'T' || vtecDateStr[12] !== 'Z') {
            return vtecDateStr; // Return original if not in expected format
        }
        const year = `20${vtecDateStr.substring(0, 2)}`;
        const month = vtecDateStr.substring(2, 4);
        const day = vtecDateStr.substring(4, 6);
        const hour = vtecDateStr.substring(7, 9);
        const minute = vtecDateStr.substring(9, 11);
        return `${year}-${month}-${day}T${hour}:${minute}:00Z`;
    }
}

// Example Usage (for testing):
// const parser = new VtecParser();
// const sampleMessage = `
// KWNS30 KWNS 212254
// WOCUS43 KDMX 212254
// SVSDMX
// IAC001-003-005-007-009-011-013-015-021-023-025-027-031-033-035-043-045-047-055-057-069-071-081-089-091-107-111-113-119-121-123-125-131-133-137-139-141-143-145-147-151-153-155-157-161-163-165-167-177-183-185-187-189-191-193-195-197-212330-
// /O.NEW.KDMX.SV.W.0030.240521T2254Z-240521T2330Z/
// 
// BULLETINTEXT
// `;
// const vtecData = parser.getVtec(sampleMessage);
// console.log(JSON.stringify(vtecData, null, 2));
