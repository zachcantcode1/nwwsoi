import definitions from './parser_config.js';

export class RawParser {
    constructor() {
        this.name = 'RawParser';
        // console.log(`Successfully initialized ${this.name} module`);
    }

    /**
     * @function getStringByLine
     * @description Get a string by line from the message and will replace the searched string with an empty string.
     * 
     * @param {string} message - The message to search in
     * @param {string} string - The string to search for
     */
    getStringByLine(message, searchString) {
        if (!message || !searchString) return null;
        const lines = message.split('\n');
        const lowerSearchString = searchString.toLowerCase();
        for (let i = 0; i < lines.length; i++) {
            const lowerLine = lines[i].toLowerCase();
            if (lowerLine.includes(lowerSearchString)) {
                const startIndexInOriginal = lowerLine.indexOf(lowerSearchString) + searchString.length;
                let result = lines[i].substring(startIndexInOriginal);
                // Trim leading/trailing whitespace, and specifically colons or periods often found after the label
                return result.replace(/^[\s.:]+/, '').trim();
            }
        }
        return null;
    }

    /**
     * @function getOfficeName
     * @description Get the office name from the message. This will search for the string "National Weather Service" or "NWS STORM PREDICTION CENTER" and return the string after it.
     * 
     * @param {string} message - The message to search in
     */
    getOfficeName(message) {
        if (!message) return null;
        let v1 = this.getStringByLine(message, 'National Weather Service ');
        let v2 = this.getStringByLine(message, 'NWS STORM PREDICTION CENTER '); // Added space at the end for consistency
        if (v1) return v1;
        if (v2) return v2;
        return null;
    }

    /**
     * @function getPolygonCoordinatesByText
     * @description Get the polygon coordinates from the message. This will search for the string "LAT...LON" and return the coordinates as an array of arrays.
     * 
     * @param {string} message - The message to search in
     */
    getPolygonCoordinatesByText(message) {
        if (!message) return [];
        const coordinates = [];
        // Regex from AtmosphericX: /LAT\.{3}LON\s+([\d\s]+)/i
        // Simplified and made more robust for variations in whitespace and newlines
        const latLonMatch = message.match(/LAT\.\.\.LON\s+(([\s\S]*?)(?:\n\n|$$))/i);

        if (latLonMatch && latLonMatch[1]) {
            const coordStringBlock = latLonMatch[1].trim();
            // Split by whitespace (including newlines) and filter out empty strings
            const coordStrings = coordStringBlock.split(/\s+/).filter(s => s.length > 0);

            for (let i = 0; i < coordStrings.length - 1; i += 2) {
                // Ensure we have pairs of coordinates
                if (coordStrings[i] && coordStrings[i + 1]) {
                    const lat = parseFloat(coordStrings[i]) / 100;
                    const lon = -1 * (parseFloat(coordStrings[i + 1]) / 100); // NWWS-OI typically uses positive West longitudes
                    if (!isNaN(lat) && !isNaN(lon)) {
                        coordinates.push([lon, lat]); // Standard GeoJSON order: [longitude, latitude]
                    }
                }
            }
            // Close the polygon if it's a valid polygon (at least 3 distinct points forming 4 pairs with closure)
            if (coordinates.length > 2 && (coordinates[0][0] !== coordinates[coordinates.length - 1][0] || coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
                coordinates.push(coordinates[0]);
            }
        }
        return coordinates;
    }

    /**
     * @function getSinglePointCoordinates
     * @description Get a single latitude and longitude coordinate pair from the message.
     * Searches for patterns like "LATITUDE: 34.56 LONGITUDE: -90.12" or "LAT/LON: 34.56 / -90.12".
     * Returns an object { latitude: float, longitude: float } or null if not found.
     * 
     * @param {string} message - The message to search in
     */
    getSinglePointCoordinates(message) {
        if (!message) return null;
        console.log(`RawParser.getSinglePointCoordinates: Original message (first 300 chars): ${message.substring(0, 300)}`);

        // Normalize message: uppercase, replace multiple spaces/newlines with single space for easier regex
        const normalizedMessage = message.toUpperCase().replace(/\s\s+/g, ' ');
        console.log(`RawParser.getSinglePointCoordinates: Normalized message (first 300 chars): ${normalizedMessage.substring(0,300)}`);
        let match;

        // Pattern 1: LATITUDE: XX.XX LONGITUDE: YY.YY (optional N/S/E/W)
        // Example: "LATITUDE: 34.56 N LONGITUDE: 90.12 W"
        // Example: "LATITUDE: 34.56 LONGITUDE: -90.12"
        // Example: "LAT:34.56N LON:90.12W"
        match = normalizedMessage.match(/(?:LATITUDE|LAT)[:.]?\s*(-?\d+\.?\d*)\s*([NS])?\s*(?:LONGITUDE|LON|LNG)[:.]?\s*(-?\d+\.?\d*)\s*([EW])?/);
        if (match) {
            console.log("RawParser.getSinglePointCoordinates: Matched Pattern 1");
            let lat = parseFloat(match[1]);
            let lon = parseFloat(match[3]);
            const latSign = match[2];
            const lonSign = match[4];

            if (latSign === 'S') lat = -lat;
            if (lonSign === 'W') lon = -lon;
            // Assume positive longitude is East, negative is West if no E/W specified and value is positive.
            // NWS data often uses positive for West, so if no 'E' and lon is positive, make it negative.
            else if (!lonSign && lon > 0) lon = -lon; 

            if (!isNaN(lat) && !isNaN(lon)) {
                console.log(`RawParser.getSinglePointCoordinates: Coords from P1: lat=${lat}, lon=${lon}`);
                return { latitude: lat, longitude: lon };
            }
        }

        // Pattern 2: LAT/LON: XX.XX / YY.YY (slash separated, common in some LSRs)
        // Example: "LAT/LON: 34.56 / -90.12"
        // Example: "LAT/LON: 34.56 / 90.12 W"
        match = normalizedMessage.match(/LAT\/LON:?\s*(-?\d+\.?\d*)\s*\/?\s*(-?\d+\.?\d*)\s*([EW])?/);
        if (match) {
            console.log("RawParser.getSinglePointCoordinates: Matched Pattern 2");
            let lat = parseFloat(match[1]);
            let lon = parseFloat(match[2]);
            const lonSign = match[3];

            if (lonSign === 'W') lon = -lon;
            else if (!lonSign && lon > 0) lon = -lon; // Assume positive West if no E/W

            if (!isNaN(lat) && !isNaN(lon)) {
                console.log(`RawParser.getSinglePointCoordinates: Coords from P2: lat=${lat}, lon=${lon}`);
                return { latitude: lat, longitude: lon };
            }
        }
        
        // Pattern 3: Separate lines for LAT and LON (e.g. aviation format)
        // This pattern operates on the original, non-normalized message due to its line-specific nature.
        // LATITUDE........34.56N
        // LONGITUDE.......90.12W
        const latLineMatch = message.match(/^\s*(?:LATITUDE|LAT)\.*\s*(-?\d+\.?\d*)\s*([NS])?/im);
        const lonLineMatch = message.match(/^\s*(?:LONGITUDE|LON)\.*\s*(-?\d+\.?\d*)\s*([EW])?/im);
        if (latLineMatch && lonLineMatch) {
            console.log("RawParser.getSinglePointCoordinates: Matched Pattern 3");
            let lat = parseFloat(latLineMatch[1]);
            let lon = parseFloat(lonLineMatch[1]); // Corrected index to 1 for lonLineMatch

            if (latLineMatch[2] === 'S') lat = -lat;
            if (lonLineMatch[2] === 'W') lon = -lon;
            else if (!lonLineMatch[2] && lon > 0) lon = -lon;

            if (!isNaN(lat) && !isNaN(lon)) {
                console.log(`RawParser.getSinglePointCoordinates: Coords from P3: lat=${lat}, lon=${lon}`);
                return { latitude: lat, longitude: lon };
            }
        }

        // Pattern 4: Direct DD.DDN DDD.DDW format (often in tabular LSRs)
        // Example: "27.64N 81.55W"
        // This pattern is applied to the normalizedMessage.
        match = normalizedMessage.match(/(\d{1,2}\.\d+)([NS])\s+(\d{1,3}\.\d+)([EW])/);
        if (match) {
            console.log("RawParser.getSinglePointCoordinates: Matched Pattern 4");
            let lat = parseFloat(match[1]);
            let lon = parseFloat(match[3]);
            const latSign = match[2];
            const lonSign = match[4];

            if (latSign === 'S') lat = -lat;
            if (lonSign === 'W') lon = -lon;
            // No need to assume positive West for this pattern as E/W is explicit

            if (!isNaN(lat) && !isNaN(lon)) {
                console.log(`RawParser.getSinglePointCoordinates: Coords from P4: lat=${lat}, lon=${lon}`);
                return { latitude: lat, longitude: lon };
            }
        }

        console.log("RawParser.getSinglePointCoordinates: No coordinate patterns matched.");
        return null;
    }

    /**
     * @function getTabularLsrEventTime
     * @description Extracts the event time from a line in an LSR that typically starts with a time.
     * Example: "0155 PM     HAIL             1 N CENTRAL PARK      40.78N 73.97W"
     * Looks for HHMM AM/PM or HHMM Z or HHMM [TZ] at the start of a line.
     * @param {string} message - The raw LSR text.
     * @returns {string|null} The extracted time string (e.g., "0155 PM", "0300 CDT", "1800 Z") or null.
     */
    getTabularLsrEventTime(message) {
        if (!message) return null;
        const lines = message.split('\n');
        // Regex to find lines that may start with whitespace then a time pattern
        // Captures: 1:HH, 2:MM, 3:AM/PM/Z (optional), 4:Known Timezone (optional)
        const timeRegex = /^\s*(\d{2})(\d{2})\s+(?:(AM|PM|Z)|(EDT|EST|CDT|CST|MDT|MST|PDT|PST))\b/i;

        for (const line of lines) {
            // No trim here, regex handles leading space
            const match = line.match(timeRegex);
            if (match) {
                const hour = match[1];
                const minute = match[2];
                const meridianOrZ = match[3]; // AM, PM, Z
                const timezone = match[4];    // EDT, CDT, etc.

                let timeString = `${hour}${minute}`;
                if (meridianOrZ) {
                    timeString += ` ${meridianOrZ}`;
                } else if (timezone) {
                    timeString += ` ${timezone}`;
                }
                return timeString;
            }
        }
        return null;
    }

} // End of RawParser class

// Example Usage (for testing):
// const parser = new RawParser();
// const sampleMessage = `
// ...some text...
// National Weather Service Gotham City
// ...other text...
// LAT...LON
// 3450 9230
// 3455 9220
// 3460 9235
// ...more text...
// `;
// console.log("Office:", parser.getOfficeName(sampleMessage));
// console.log("Polygon:", parser.getPolygonCoordinatesByText(sampleMessage));
