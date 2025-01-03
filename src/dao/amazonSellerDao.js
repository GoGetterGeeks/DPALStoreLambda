import { ddbDocumentClient } from './ddbConfig.js';
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import dotenv from 'dotenv';
dotenv.config();

export const insertAmazonData = async (dataList) => {
    console.log("Inserting data to DB...");

    const tableName = process.env.DYNAMODB_TABLE_NAME;

    try {
        for(const item of dataList) {
            const params = {
                TableName: tableName,
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
                    gpk: item.status,
                    gsk: "No",
                },
                ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)", // Ensure no duplicate entry
            };

            try {
                await ddbDocumentClient.send(new PutCommand(params));
                console.log(`Successfully inserted item: ${item.amazonOrderId}-${item.orderItemId}`);
            } catch (error) {
                if (error.name === "ConditionalCheckFailedException") {
                    console.log(`Item already exists: ${item.amazonOrderId}-${item.orderItemId}. Skipping insertion.`);
                } else {
                    console.error("Error inserting item:", error);
                }
            }
        }
    } catch (error) {
        console.error("Error inserting items into DynamoDB:", error);
    }
};
