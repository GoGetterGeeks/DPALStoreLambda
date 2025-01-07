import { ddbDocumentClient } from './ddbConfig.js';
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import dotenv from 'dotenv';
dotenv.config();

const tableName = process.env.DYNAMODB_TABLE_NAME;

export const insertAmazonData = async (dataList) => {
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
                    orderStatus: item.orderStatus ? item.orderStatus.toLowerCase() : null,
                    gpk: "unshipped_unscrapped",
                    gsk: item.purchaseDate,
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
        throw error;
    }
};

export const getByStatus = async (status) => {
    try {
        const params = {
            TableName: tableName,
            IndexName: 'gsi1',
            KeyConditionExpression: '#gpk = :statusVal',
            ExpressionAttributeNames: {
                '#gpk': 'gpk'
            },
            ExpressionAttributeValues: {
                ':statusVal': status
            }
        };

        const result = await ddbDocumentClient.send(new QueryCommand(params));

        const orderItemDataList = result.Items.map(item => ({
            amazonOrderId: item.pk,
            orderItemId: item.sk,
            purchaseDate: item.purchaseDate || null,
            sku: item.sku || null,
            quantity: item.quantity ? parseInt(item.quantity, 10) : null,
            earliestShipDate: item.earliestShipDate || null,
            latestShipDate: item.latestShipDate || null,
            shippingAddress: item.shippingAddress || null,
            color: item.color || null,
            size: item.size || null,
            personalization: item.personalization || null,
            option: item.option || null,
            shipTo: item.shipTo || null,
            orderStatus: item.orderStatus || null
        }));

        console.info(`Fetched ${orderItemDataList.length} order items by status ${status} from DB`);
        return orderItemDataList;
    } catch (error) {
        console.error('Error fetching order items by status:', error);
        throw error;
    }
};

export const updateOrderItemData = async (orderItemData, amazonOrderId, newStatus) => {
    const params = {
        TableName: tableName,
        Key: {
            pk: amazonOrderId, 
            sk: orderItemData.OrderItemId  
        },
        UpdateExpression: "set #orderStatus = :orderStatus, #gpk = :gpk",
        ExpressionAttributeNames: {
            "#orderStatus": "orderStatus",
            "#gpk": "gpk",
        },
        ExpressionAttributeValues: {
            ":orderStatus": newStatus,
            ":gpk": newStatus,
        },
        ReturnValues: "UPDATED_NEW"
    };

    try {
        const result = await ddbDocumentClient.send(new UpdateCommand(params));
        console.log("Order updated successfully:", result);
    } catch (error) {
        console.error("Error updating order item:", error);
        throw error;
    }
};
