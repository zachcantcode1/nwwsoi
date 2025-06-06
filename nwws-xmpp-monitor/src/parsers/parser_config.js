export default {
  // Regex to find a VTEC string in a message
  vtec_regexp: /\/([A-Z0-9]\.[A-Z]{3}\.[A-Z0-9]{2}\.[A-Z]{2}\.\w\.[0-9]{4}\.[0-9]{6}T[0-9]{4}Z-[0-9]{6}T[0-9]{4}Z)\//,
  // Example: /O.NEW.KDMX.SV.W.0030.240521T2254Z-240521T2330Z/

  // Regex to find a WMO header
  wmo_regexp: /[A-Z]{4}[0-9]{2}\s[A-Z]{4}\s[0-9]{6}/,
  // Example: KWNS30 KWNS 212254

  // Regex for the start of a UGC string
  ugc_start_regexp: /[A-Z]{2}[CZ][0-9]{3}(-[0-9]{6})?/,
  // Example: IAC001-212330Z

  // Regex for the end of a UGC string (often a newline or specific character)
  // This might need to be adjusted based on actual message format.
  // The original parser used /\n|\s{2,}|\$/gimu for the end.
  // For simplicity, let's assume it ends with a newline or end of string for now.
  ugc_end_regexp: /\n|$/,

  // VTEC Event Codes (Phenomena)
  event_codes: {
    'SV': 'Severe Thunderstorm Warning',
    'TO': 'Tornado Warning',
    'FF': 'Flash Flood Warning',
    'FA': 'Flood Advisory',
    'FL': 'Flood Warning',
    'MA': 'Marine Advisory',
    'UP': 'Unknown Precipitation'
  },

  // VTEC Event Types (Significance) - Example, needs to be comprehensive
  event_types: {
    'W': 'Warning',
    'A': 'Watch',
    'Y': 'Advisory',
    'S': 'Statement',
    // ... add all other relevant significance codes
  },

  // VTEC Status Signatures (Action) - Example, needs to be comprehensive
  status_signatures: {
    'NEW': 'New',
    'CON': 'Continued',
    'EXP': 'Expired',
    'CAN': 'Cancelled',
    // ... add all other relevant action codes
  },

  // Allowed event names
  allowed_events: [
    "Tornado Warning",
    "Severe Thunderstorm Warning",
    "Flash Flood Warning",
    "Flood Warning",
  ],

  // Event filtering method
  shouldProcessEvent: function (eventName) {
    return this.allowed_events.includes(eventName);
  },

  // Allowed UGC codes
allowed_ugc_codes: [
  "KYC105", "KYC075", "KYC039", "KYC007", "KYC145", "KYC083", "KYC157",
  "KYC035", "KYC139", "KYC221", "KYC143", "KYC055", "KYC033", "KYC047",
  "KYC107", "KYC233", "KYC225", "KYC101", "KYC059", "KYC149", "KYC177",
  "KYC219", "KYC141", "KYC213", "KYC031", "KYC183", "KYC091", "KYC227"
],

  // UGC filtering method
  shouldProcessUgc: function (parsedUgc) {
    console.log('[parser_config] Attempting UGC filter. Allowed UGCs:', JSON.stringify(this.allowed_ugc_codes));
    console.log('[parser_config] Received parsedUgc for filtering:', JSON.stringify(parsedUgc, null, 2));

    if (!parsedUgc || !parsedUgc.zones || parsedUgc.zones.length === 0) {
      // If requireUgcFiltering is true and no UGCs, then false. If false, then true.
      // For now, let's assume if there are no UGCs in the alert, but we are filtering by UGC,
      // then it should not pass. If an alert has no UGCs and we are *not* filtering by UGC, it should pass.
      // This logic might need refinement based on whether an alert *must* have one of the allowed UGCs,
      // or if it should pass through if it has no UGCs at all.
      // Current assumption: if filtering is on, an alert MUST have an allowed UGC.
      console.log('[parser_config] UGC data is invalid or no zones found. Filtering out.');
      return false; 
    }
    const passes = parsedUgc.zones.some(zone => {
      const included = this.allowed_ugc_codes.includes(zone);
      console.log(`[parser_config] Checking zone "${zone}": in allowed list? ${included}`);
      return included;
    });
    console.log('[parser_config] UGC filter decision (shouldProcessUgc):', passes);
    return passes;
  },

  // Allowed LSR Issuing Offices
  allowed_lsr_issuing_offices: [
    "Paducah KY",
    "Louisville KY"
  ],

  // LSR Issuing Office filtering method
  shouldProcessLsrByOffice: function (issuingOffice) {
    if (!issuingOffice) {
      // If an LSR has no issuing office, and we are filtering, it shouldn't pass.
      // If we are not filtering (list is empty), this function won't be the deciding factor.
      return false; 
    }
    // If the allowed list is empty, this specific filter effectively allows all offices.
    // The check for an empty list should ideally be done before calling this function in index.js,
    // similar to how allowed_ugc_codes is handled.
    // However, for robustness within this function:
    if (this.allowed_lsr_issuing_offices.length === 0) {
        return true; 
    }
    return this.allowed_lsr_issuing_offices.includes(issuingOffice);
  }
};
