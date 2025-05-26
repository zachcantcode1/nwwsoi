# NWWS XMPP Monitor

This project connects to the National Weather Service (NWS) Operations and Integration (NWWS-OI) XMPP server to monitor weather products. It focuses on parsing alerts (CAP - Common Alerting Protocol) and Local Storm Reports (LSRs), categorizing them, and forwarding the structured data to a specified webhook. It also includes a feature to filter messages based on UGC (Universal Geographic Code).

## Features

- Connects to the NWWS-OI XMPP server using `@xmpp/client@^0.7.3`.
- Parses incoming XMPP messages, specifically targeting CAP alerts and plain-text products like Local Storm Reports.
- Extracts detailed information using VTEC (Valid Time Event Code), UGC, and raw text parsing techniques.
- Categorizes messages (e.g., 'alert', 'storm_report').
- Filters messages based on a configurable list of UGC codes.
- Sends parsed and filtered data to a user-defined webhook URL.

## Project Structure

```
nwws-xmpp-monitor
├── src
│   ├── index.js                # Main application entry point, handles message flow and UGC filtering
│   ├── xmpp/
│   │   └── client.js           # XMPP client logic for NWWS-OI connection
│   ├── categorizer/
│   │   └── index.js            # Categorizes incoming messages (e.g., alert, storm_report)
│   ├── parsers/
│   │   ├── alertParser.js      # Parses CAP alert messages
│   │   ├── stormReportParser.js# Parses Local Storm Reports (LSRs)
│   │   ├── rawParser.js        # Utility parser for raw text data extraction
│   │   ├── vtecParser.js       # Utility parser for VTEC strings
│   │   ├── ugcParser.js        # Utility parser for UGC strings
│   │   └── parser_config.js    # Configuration for parsers (regex, codes)
│   └── webhook/
│       └── sender.js           # Sends processed data to the configured webhook
├── .env                        # Environment variables (XMPP credentials, webhook URL, UGC filters)
├── .gitignore                  # Specifies intentionally untracked files that Git should ignore
├── package.json                # npm project configuration and dependencies
├── README.md                   # This file
```

## Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/nwws-xmpp-monitor.git # Replace with your actual repo URL
   cd nwws-xmpp-monitor
   ```

2. **Install dependencies:**
   Ensure you have Node.js (preferably a recent LTS version) installed. Then run:
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory of the project. Copy the contents of `.env.example` (if one exists) or create it from scratch with the following variables:

   ```properties
   # XMPP Connection Details
   XMPP_SERVICE_URL=xmpp://nwws-oi.weather.gov
   XMPP_DOMAIN=nwws-oi.weather.gov
   XMPP_USER=your_nwws_oi_username # e.g., firstname.lastname
   XMPP_PASSWORD=your_nwws_oi_password
   XMPP_ROOM=nwws@conference.nwws-oi.weather.gov # Or another specific room if needed

   # Webhook Configuration
   WEBHOOK_URL=your_webhook_url_here # e.g., https://hooks.yourwebhookservice.com/...

   # UGC Filtering (Optional)
   # Comma-separated list of UGC codes to process. If empty or not set, all messages pass this filter.
   # Example: UGC_FILTER_CODES=KYC105,KYC075,INC001
   UGC_FILTER_CODES=
   ```
   - Obtain NWWS-OI XMPP credentials from the NWS.
   - Replace `your_webhook_url_here` with the actual URL of your webhook receiver.
   - Populate `UGC_FILTER_CODES` with specific county/zone codes if you want to filter alerts for particular areas.

## Usage

To start the application, run the following command from the project's root directory:

```bash
node src/index.js
```
Or, if you have `nodemon` installed (listed in `devDependencies`), you can use it for automatic restarts during development:
```bash
npm run start # Assuming your package.json start script uses nodemon or node src/index.js
```

The application will connect to the NWWS-OI XMPP server, join the specified room, and begin processing messages. Parsed and filtered data will be sent as a JSON payload to your configured `WEBHOOK_URL`. Check the console output for connection status, message processing logs, and any errors.

## How it Works

1. **Connection**: The `XMPPClient` establishes a connection to the NWWS-OI server and joins the specified MUC (Multi-User Chat) room.
2. **Message Reception**: Raw XMPP messages (stanzas) are received.
3. **Categorization**: `categorizer/index.js` inspects each message (primarily its XML structure) to determine its type. It looks for CAP `<alert>` elements to identify alerts. Logic for other types like storm reports is also present.
4. **Parsing**:
   - If categorized as an 'alert', `alertParser.js` processes the message. It uses `vtecParser.js`, `ugcParser.js`, and `rawParser.js` to extract VTEC strings, UGC codes, polygon coordinates, and other details from the raw text and the CAP XML structure.
   - If categorized as a 'storm_report', `stormReportParser.js` processes the message, typically using `rawParser.js` and `ugcParser.js` for plain-text LSRs.
5. **UGC Filtering**: After parsing, `src/index.js` checks if `UGC_FILTER_CODES` is set in the environment. If so, it verifies if the parsed message's UGC zones match any of the allowed codes. If not, the message is discarded.
6. **Webhook Sending**: If the message passes the UGC filter (or if no filter is active), the resulting JSON object is sent to the `WEBHOOK_URL` via `webhook/sender.js`.

## Contributing

Contributions are welcome! If you have suggestions, find a bug, or want to add a feature:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature-name`).
3. Make your changes.
4. Commit your changes (`git commit -am 'Add some feature'`).
5. Push to the branch (`git push origin feature/your-feature-name`).
6. Create a new Pull Request.

Please ensure your code follows the existing style and that any new features are appropriately documented.

## License

This project is licensed under the ISC License. See the `package.json` file for more details (typically, a `LICENSE` file would also be present for full license text).