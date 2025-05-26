import axios from 'axios';
import FormData from 'form-data'; // For sending multipart/form-data

export const sendToWebhook = async (webhookUrl, jsonData, imageBuffer, imageFileName) => {
    try {
        if (imageBuffer && imageFileName) {
            const form = new FormData();
            // Append the JSON data as a string field
            form.append('jsonData', JSON.stringify(jsonData));
            // Append the image buffer as a file
            form.append('imageFile', imageBuffer, {
                filename: imageFileName,
                contentType: 'image/png', // Assuming PNG, adjust if other types are possible
            });

            const response = await axios.post(webhookUrl, form, {
                headers: {
                    ...form.getHeaders(), // Important for Axios to set correct multipart boundary
                },
            });
            console.log('Webhook (multipart) sent successfully:', response.data);
        } else {
            // No image, send JSON data directly
            const response = await axios.post(webhookUrl, jsonData);
            console.log('Webhook (JSON) sent successfully:', response.data);
        }
    } catch (error) {
        console.error('Error sending webhook:', error.response ? error.response.data : error.message);
    }
};