import { definitions } from './parser_config.js';

export class UgcParser {
    constructor() {
        this.name = 'UgcParser';
        // console.log(`Successfully initialized ${this.name} module`);
        // Note: The original UGC parser had a dependency on a database for location names.
        // This version will only parse UGC zones and will not resolve them to location names.
    }

    /**
     * @function getUgc
     * @description Get the UGC from the message. This will search for the UGC in the message and return it as an object.
     * 
     * @param {string} message - The message to search in
     * @returns {object|null} Parsed UGC object with zones, or null if not found.
     */
    getUgc(message) {
        if (!message) return null;
        const header = this.getHeader(message);
        if (!header) return null;

        const zones = this.getZones(header);
        const ugc = {};

        if (zones && zones.length > 0) {
            ugc.zones = zones;
            // ugc.locations = []; // Location lookup would require a database or a large mapping file
            return ugc;
        }
        return null;
    }

    /**
     * @function getZones
     * @description Get the zones from the UGC header string. This will search for the zones in the header and return them as an array.
     * 
     * @param {string} header - The UGC header string (e.g., "IAC001-003>005-007-MOC010")
     * @returns {array} Array of zone strings.
     */
    getZones(header) {
        if (!header) return [];
        const ugcSplit = header.split('-');
        let zones = [];
        let currentState = '';
        let currentFormat = ''; // C for County, Z for Zone

        for (let i = 0; i < ugcSplit.length; i++) {
            const part = ugcSplit[i];
            if (!part) continue;

            // Check if the part starts with a state and format code (e.g., IAC, MOC, ARZ)
            const stateMatch = part.match(/^([A-Z]{2})([CZ])/);
            if (stateMatch) {
                currentState = stateMatch[1];
                currentFormat = stateMatch[2];
                const zoneNumberPart = part.substring(3);

                if (zoneNumberPart.includes('>')) {
                    const [startStr, endStr] = zoneNumberPart.split('>');
                    const startNum = parseInt(startStr, 10);
                    const endNum = parseInt(endStr, 10);
                    if (!isNaN(startNum) && !isNaN(endNum)) {
                        for (let j = startNum; j <= endNum; j++) {
                            zones.push(`${currentState}${currentFormat}${j.toString().padStart(3, '0')}`);
                        }
                    }
                } else if (zoneNumberPart) {
                    zones.push(`${currentState}${currentFormat}${zoneNumberPart.padStart(3, '0')}`);
                }
            } else { // This part is a continuation of the previous state/format
                if (!currentState || !currentFormat) continue; // Should not happen if header is well-formed

                if (part.includes('>')) {
                    const [startStr, endStr] = part.split('>');
                    const startNum = parseInt(startStr, 10);
                    const endNum = parseInt(endStr, 10);
                    if (!isNaN(startNum) && !isNaN(endNum)) {
                        for (let j = startNum; j <= endNum; j++) {
                            zones.push(`${currentState}${currentFormat}${j.toString().padStart(3, '0')}`);
                        }
                    }
                } else {
                    zones.push(`${currentState}${currentFormat}${part.padStart(3, '0')}`);
                }
            }
        }
        return zones.filter(item => item !== '');
    }

    /**
     * @function getHeader
     * @description Get the UGC header from the message. This will search for the header in the message and return it as a string.
     * 
     * @param {string} message - The message to search in
     * @returns {string|null} The UGC header string or null.
     */
    getHeader(message) {
        if (!message) return null;
        // The UGC line typically starts with state/zone codes and ends before a double newline or specific markers.
        // Example: IAC001-003-005-220000-
        // Or:     FLZ072-074-172-173-242300-
        // The AtmosphericX regexes were: 
        // ugc_start_regexp: /[A-Z]{2}[CZ][0-9]{3}(-[0-9]{6})?/,
        // ugc_end_regexp: /\n|\s{2,}|\$/gimu
        // We will look for a line that starts with UGC pattern and ends with a timestamp like YYMMDDHHMM-
        // Or simply the line that matches the start regex and take it up to the next line or specific end characters.

        const lines = message.split('\n');
        for (const line of lines) {
            // Trim the line and check if it matches a typical UGC string pattern
            const trimmedLine = line.trim();
            // A UGC line often ends with something like '012345-' (timestamp) or just the codes.
            // It should not be the VTEC line.
            if (trimmedLine.match(definitions.ugc_start_regexp) && !trimmedLine.startsWith('/')) {
                // Remove trailing timestamp like -DDHHMM- or -YYMMDDHHMM-
                let header = trimmedLine.replace(/(-[0-9]{6}-?)$/, '').replace(/(-[0-9]{8}-?)$/, '');
                // Remove any trailing non-alphanumeric, non-'>', non-'-' characters
                header = header.replace(/[^A-Z0-9>\-]+$/, '');
                return header;
            }
        }
        return null;
    }
}

// Example Usage (for testing):
// const parser = new UgcParser();
// const sampleMessage1 = `
// WOCUS43 KDMX 212254
// SVSDMX
// IAC001-003-005-007-009-011-013-015-021-023-025-027-031-033-035-043-045-047-055-057-069-071-081-089-091-107-111-113-119-121-123-125-131-133-137-139-141-143-145-147-151-153-155-157-161-163-165-167-177-183-185-187-189-191-193-195-197-212330-
// /O.NEW.KDMX.SV.W.0030.240521T2254Z-240521T2330Z/
// BULLETINTEXT
// `;
// const sampleMessage2 = `ARZ001>003-007-MOZ005-220000-`;
// const sampleMessage3 = `FLZ072-074-172-173-242300-`;

// console.log("UGC from message 1:", parser.getUgc(sampleMessage1));
// console.log("UGC from message 2:", parser.getUgc(sampleMessage2));
// console.log("UGC from message 3:", parser.getUgc(sampleMessage3));

