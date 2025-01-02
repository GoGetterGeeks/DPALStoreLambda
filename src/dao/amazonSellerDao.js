import { ddbDocumentClient } from './ddbConfig.js';
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import dotenv from 'dotenv';
dotenv.config();

export const insertAmazonData = async (dataList) => {
    console.log("Inserting data to DB in bulk...");

    const tableName = process.env.DYNAMODB_TABLE_NAME;

    // Split dataList into chunks of 25 (DynamoDB batch limit is 25 items per operation)
    const chunkedData = [];
    const chunkSize = 25;

    for (let i = 0; i < dataList.length; i += chunkSize) {
        chunkedData.push(dataList.slice(i, i + chunkSize));
    }

    try {
        for (const chunk of chunkedData) {
            const params = {
                RequestItems: {
                    [tableName]: chunk.map((item) => ({
                        PutRequest: {
                            Item: {
                                pk: item.amazonOrderId,
                                sk: item.orderItemId,
                                sku: item.sku,
                                purchaseDate: item.purchaseDate,
                                quantity: item.quantity,
                                latestShipDate: item.latestShipDate,
                                earliestShipDate: item.earliestShipDate,
                                shippingAddress: item.shippingAddress,
                                status: item.status,
                                scrappedStatus: "No",
                            },
                        },
                    })),
                },
            };

            await ddbDocumentClient.send(new BatchWriteCommand(params));
            console.log(`Successfully inserted ${chunk.length} items.`);
        }
    } catch (error) {
        console.error("Error inserting items into DynamoDB:", error);
    }
};
