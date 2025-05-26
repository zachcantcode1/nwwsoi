// Helper function to recursively find a CAP alert element
function findCapAlert(element) {
    if (!element || typeof element === 'string') {
        return null;
    }
    if (element.name === 'alert' && element.attrs.xmlns && element.attrs.xmlns.startsWith('urn:oasis:names:tc:emergency:cap:')) {
        return element;
    }
    if (element.children && Array.isArray(element.children)) {
        for (const child of element.children) {
            const found = findCapAlert(child);
            if (found) return found;
        }
    }
    return null;
}

export default function categorizeMessage(rawText, id, stanza) {
    console.log('Categorizer: Received stanza for categorization. Stanza name:', stanza?.name);
    let capAlertElement = null;

    if (stanza) {
        capAlertElement = findCapAlert(stanza);
        if (capAlertElement) {
            console.log('Categorizer: CAP Alert found.');
            return { category: 'alert', capAlertElement: capAlertElement };
        }
    }

    // Placeholder for storm report categorization
    // For example, storm reports might be identified by a specific XML structure or keywords in rawText
    // if (rawText && rawText.toLowerCase().includes('storm report')) {
    //     console.log('Categorizer: Storm Report keyword found in rawText.');
    //     return { category: 'storm_report', capAlertElement: null }; // Or pass relevant element if storm reports are XML
    // }
    // Or, if storm reports come via a specific pubsub node that can be checked in stanza.attrs or children:
    // const itemsNode = stanza.getChild('event')?.getChild('items');
    // if (itemsNode && itemsNode.attrs.node === 'some_storm_report_node_identifier') {
    //     console.log('Categorizer: Storm Report node identified.');
    //     return { category: 'storm_report', capAlertElement: null }; // Or pass relevant element if storm reports are XML
    // }

    console.log('Categorizer: Message type not identified as CAP alert or storm report. ID:', id);
    return { category: 'unknown_category', capAlertElement: null };
}