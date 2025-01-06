import { fetchInventoryAndInsert, fetchUnshippedOrdersAndUpdate } from './src/services/amazonApiService.js';
import dotenv from 'dotenv';
dotenv.config();

export const handler = async (event) => {
    try {
        console.log("Event:", event);

        await fetchUnshippedOrdersAndUpdate();

        const data = await fetchInventoryAndInsert();
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Inventory fetched and stored in database successfully. Total items processed: ${data.length}`,
            }),
        };
    } catch (error) {
        console.error("Error fetching or storing data:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Error fetching or storing data",
            }),
        };
    }
};