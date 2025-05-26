import { definitions } from './parser_config.js';

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
    getStringByLine(message, string) {
        if (!message || !string) return null;
        const lines = message.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(string)) {
                const start = lines[i].indexOf(string) + string.length;
                // const end = lines[i].length; // Original logic
                // let result = lines[i].substring(start, end); // Original logic
                let result = lines[i].substring(start);
                return result.replace(/^\s+|\s+$/g, '').replace(/<$/, '').trim(); // Removed < replacement, as it might be too broad
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
}

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
