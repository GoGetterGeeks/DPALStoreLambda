import { fetchInventory } from './src/services/amazonApiService.js';
import dotenv from 'dotenv';
dotenv.config();

exports.handler = async () => {
    try {
        await fetchInventory();

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Inventory fetched and stored in database successfully",
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