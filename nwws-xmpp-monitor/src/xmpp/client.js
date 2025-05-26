import { client as xmppClientLib, xml } from '@xmpp/client';

export class XMPPClient {
    constructor(onMessage) {
        this.onMessage = onMessage;
        this.serviceUrl = process.env.XMPP_SERVICE_URL; // Changed from xmppServer
        this.xmppDomain = process.env.XMPP_DOMAIN;
        this.user = process.env.XMPP_USER;
        this.password = process.env.XMPP_PASSWORD;
        this.room = process.env.XMPP_ROOM;
        this.client = null;
        this.reconnectionTimeout = 5000; // 5 seconds
        this.initialConnection = true;
        console.log('XMPPClient instance created. Service URL:', this.serviceUrl, 'Domain:', this.xmppDomain);
    }

    async connect() {
        console.log('XMPPClient.connect method entered.');

        if (!this.serviceUrl || !this.xmppDomain || !this.user || !this.password || !this.room) {
            const errMsg = 'XMPP service URL, domain, credentials, or room info is missing. Check .env file (XMPP_SERVICE_URL, XMPP_DOMAIN, XMPP_USER, XMPP_PASSWORD, XMPP_ROOM).';
            console.error(errMsg);
            return Promise.reject(new Error(errMsg));
        }

        // Remove WSS validation, as serviceUrl might be xmpp:// now
        // if (typeof this.serviceUrl !== 'string' || !this.serviceUrl.startsWith('wss://')) {
        //     const errMsg = `Invalid XMPP_SERVER format: ${this.serviceUrl}. It should be a WebSocket URL (wss://...).`;
        //     console.error(errMsg);
        //     return Promise.reject(new Error(errMsg));
        // }

        console.log(`Attempting to connect to XMPP service: ${this.serviceUrl}, domain: ${this.xmppDomain}, user: ${this.user}`);

        this.client = xmppClientLib({
            service: this.serviceUrl, // Use serviceUrl from .env
            domain: this.xmppDomain, // Use xmppDomain from .env
            resource: 'nwws-xmpp-monitor',
            username: this.user,
            password: this.password,
        });

        this.client.on('error', (err) => {
            console.error('XMPP Client Error:', err.message ? err.message : err);
            // Avoid reconnecting if error is 'not-authorized' during initial connection
            if (err.condition === 'not-authorized' && this.initialConnection) {
                console.error('XMPP authentication failed. Please check credentials.');
                // Do not schedule reconnect here, let the connect() promise reject.
            } else if (err.message && err.message.includes('ENOTFOUND')) {
                console.error(`XMPP service ${this.serviceUrl} or domain ${this.xmppDomain} not found. Check server address and network.`); // Updated error message
            }
            else {
                this.scheduleReconnect();
            }
        });

        this.client.on('offline', () => {
            console.log('XMPP client offline.');
            this.scheduleReconnect();
        });

        this.client.on('stanza', (stanza) => this.handleStanza(stanza));

        return new Promise(async (resolve, reject) => {
            this.client.on('online', async (address) => {
                console.log('XMPP client online, JID:', address.toString());
                this.initialConnection = false; // Successfully connected once
                try {
                    // Send presence to join the MUC room
                    // The resource part of the 'to' JID is our nickname in the room.
                    // Using this.user (XMPP username) as the nickname.
                    await this.client.send(xml('presence', { to: `${this.room}/${this.user}` }, xml('x', { xmlns: 'http://jabber.org/protocol/muc' })));
                    console.log(`Presence sent to join room: ${this.room} as ${this.user}`);
                    this.reconnectionTimeout = 5000; // Reset reconnection timeout
                    resolve(); // Resolve the connect promise
                } catch (err) {
                    console.error('Error joining MUC room:', err);
                    this.scheduleReconnect();
                    reject(err); // Reject connect promise if joining room fails
                }
            });

            try {
                console.log('Attempting this.client.start()...');
                if (typeof this.client.start !== 'function') {
                    console.error('this.client.start is not a function!');
                    return reject(new Error('XMPP internal error: client.start is not a function.'));
                }
                const startPromise = this.client.start();
                console.log('this.client.start() was called. Is it a promise?', startPromise instanceof Promise);
                if (!(startPromise instanceof Promise)) {
                    console.error('this.client.start() did not return a Promise!');
                    return reject(new Error('XMPP internal error: client.start did not return a Promise.'));
                }
                await startPromise;
                console.log('this.client.start() awaited successfully.');
                // 'online' event will handle resolving the promise.
            } catch (error) {
                console.error('Error during XMPP client.start():', error.message ? error.message : error);
                this.initialConnection = false; // Mark that an attempt was made
                this.scheduleReconnect();
                reject(error); // Reject the connect promise
            }
        });
    }

    async disconnect() {
        console.log('Disconnecting XMPP client...');
        if (this.client) {
            try {
                // Send unavailable presence
                await this.client.send(xml('presence', { type: 'unavailable' }));
                // Stop the client
                await this.client.stop();
                console.log('XMPP client stopped.');
            } catch (error) {
                console.error('Error during XMPP disconnect:', error);
            } finally {
                this.client = null;
            }
        }
    }

    scheduleReconnect() {
        if (this.client && (this.client.status === 'connecting' || this.client.status === 'online')) {
            console.log('Reconnect scheduled but client is already connecting or online. Skipping.');
            return;
        }
        // Clear previous timer if any, to avoid multiple reconnect loops
        if (this.reconnectTimerId) {
            clearTimeout(this.reconnectTimerId);
            this.reconnectTimerId = null;
        }
        console.log(`Scheduling XMPP reconnection in ${this.reconnectionTimeout / 1000} seconds.`);
        this.reconnectTimerId = setTimeout(async () => {
            console.log('Attempting XMPP reconnection...');
            try {
                // Ensure client is stopped before attempting to start again if it exists
                if (this.client) {
                    await this.client.stop().catch(e => console.warn('Error stopping client before reconnect:', e.message));
                }
                // Re-initialize and connect.
                // The connect method itself now returns a promise that can be used.
                // We need to re-initialize the client instance or ensure connect() does.
                // For simplicity, let's rely on connect to re-initialize if needed.
                // The current connect method re-creates this.client.
                await this.connect(); // connect() will set up a new client object
            } catch (error) {
                console.error('Reconnection attempt failed:', error.message);
                this.reconnectionTimeout = Math.min(this.reconnectionTimeout * 2, 60000); // Exponential backoff up to 1 minute
                // scheduleReconnect will be called again by error/offline handlers if it fails again
            }
        }, this.reconnectionTimeout);
    }

    handleStanza(stanza) {
        this.lastStanzaTime = Date.now(); // Update last stanza time for potential inactivity checks

        if (stanza.is('message')) {
            const from = stanza.attrs.from;
            const type = stanza.attrs.type;

            // Ensure message is from the room and not an error message or our own message
            if (from && from.startsWith(this.room) && !from.endsWith(`/${this.user}`) && type !== 'error') {
                console.log(`Received groupchat message from ${from}`);

                const productPayloadEl = stanza.getChild('x'); // Look for any <x> element first

                if (productPayloadEl) {
                    const productId = productPayloadEl.attrs.id;
                    let rawText = null;

                    if (productPayloadEl.children && productPayloadEl.children.length > 0) {
                        // Assuming the first child of <x> contains the product text
                        rawText = productPayloadEl.children[0].toString();
                    }

                    if (rawText && productId) {
                        console.log(`NWWS-OI Product (ID: ${productId}): ${rawText.substring(0, 150)}...`);
                        if (this.onMessage) {
                            this.onMessage({ rawText, id: productId, stanza });
                        }
                    } else if (rawText) {
                        // We got text from <x> but no product ID, might be a different kind of <x> payload
                        console.log(`Message from ${from} with <x> payload but no 'id' attribute. Body: ${rawText.substring(0, 100)}...`);
                    } else {
                        // <x> element exists but no children or content, check for body as fallback
                        const body = stanza.getChildText('body');
                        if (body) {
                            console.log(`Message from ${from} with <x> but no direct content, fallback to body: ${body.substring(0, 100)}...`);
                            // Decide if this should be processed by onMessage. For now, only <x> with id and content.
                        } else {
                            console.log(`Message from ${from} with <x> element but no parsable content or body.`);
                        }
                    }
                } else {
                    // No <x> payload, check for standard message body
                    const body = stanza.getChildText('body');
                    if (body) {
                        console.log(`Received standard MUC message (no <x> payload) from ${from}: ${body.substring(0, 100)}...`);
                        // Typically, NWWS-OI products are in <x>. Decide if plain body messages are relevant.
                        // For now, we are primarily interested in the <x> payload.
                        // If you need to process these, you could call this.onMessage here with stanza.attrs.id
                    } else {
                        console.log(`Received message from ${from} with no <x> payload and no body.`);
                    }
                }
            } else if (from && from.endsWith(`/${this.user}`)) {
                // Our own message reflected back, ignore.
            } else if (type === 'error') {
                console.error('Received error message stanza:', stanza.toString());
            } else {
                console.log('Received unhandled message type or sender:', stanza.toString());
            }
        } else if (stanza.is('presence')) {
            const from = stanza.attrs.from;
            const type = stanza.attrs.type;
            console.log(`Received presence from ${from}, type: ${type || 'available'}`);
            if (type === 'error') {
                console.error('Presence error:', stanza.toString());
                const errorElement = stanza.getChild('error');
                if (errorElement) {
                    const condition = errorElement.children.find(el => el.name !== 'text'); // Find the error condition element
                    if (condition && condition.name === 'item-not-found') { // Example: room not found (XEP-0045)
                        console.error(`Error: Room ${this.room} not found or user not authorized for presence.`);
                    } else if (condition && condition.name === 'not-authorized') {
                        console.error(`Error: Not authorized to join room ${this.room} or send presence.`);
                    }
                }
            }
            // Handle other presence types if needed (e.g., user joined/left, unavailable)
        }
    }
}