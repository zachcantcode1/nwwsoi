import axios from 'axios';

export const sendToWebhook = async (webhookUrl, data) => {
    try {
        const response = await axios.post(webhookUrl, data);
        console.log('Webhook sent successfully:', response.data);
    } catch (error) {
        console.error('Error sending webhook:', error);
    }
};