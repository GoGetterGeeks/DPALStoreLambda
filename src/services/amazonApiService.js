import SellingPartner from 'amazon-sp-api';
import { insertAmazonData } from '../dao/amazonSellerDao.js';
import dotenv from 'dotenv';
dotenv.config();

const UNSHIPPED_ORDER_STATUSES = [
    "Unshipped",
    "PartiallyShipped"
];

const AMAZON_ORDER_STATUS_TO_DPAL_STATUS_MAP = new Map([
    ['Shipped', 'Shipped'],
    ['PartiallyShipped', 'Unshipped'],
    ['Unshipped', 'Unshipped']
]);

export const fetchInventory = async () => {
    try {
        const spConfig = {
            region: "na",
            refresh_token: process.env.REFRESH_TOKEN,
            credentials: {
                SELLING_PARTNER_APP_CLIENT_ID: process.env.AMAZON_SP_CLIENT_ID,
                SELLING_PARTNER_APP_CLIENT_SECRET: process.env.AMAZON_SP_CLIENT_SECRET,
            }
        };

        const sellingPartner = new SellingPartner(spConfig);

        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() - 2);
        const formattedDate = currentDate.toISOString().split('T')[0]; // Extracts the date portion

        const query = {
            operation: "getOrders",
            endpoint: "orders",
            query: {
                MarketplaceIds: "ATVPDKIKX0DER",
                CreatedAfter: formattedDate,
                OrderStatuses: UNSHIPPED_ORDER_STATUSES,
            }
        };

        console.log('Fetching inventory');
        let response = await sellingPartner.callAPI(query);

        let storeData = [];
        for (const order of response.Orders) {
            let orderItemResponse = await sellingPartner.callAPI({
                operation: "getOrderItems",
                endpoint: "orders",
                path: {
                    orderId: order.AmazonOrderId
                },
                query: {
                    NextToken: null
                }
            });

            for (const orderItem of orderItemResponse.OrderItems) {
                const data = {
                    orderItemId: orderItem.OrderItemId,
                    amazonOrderId: order.AmazonOrderId,
                    sku: orderItem.SellerSKU,
                    purchaseDate: order.PurchaseDate,
                    quantity: orderItem.QuantityOrdered,
                    latestShipDate: order.LatestShipDate,
                    earliestShipDate: order.EarliestShipDate,
                    shippingAddress: order.ShippingAddress,
                    status: AMAZON_ORDER_STATUS_TO_DPAL_STATUS_MAP.get(order.OrderStatus),
                };
                storeData.push(data);
            }
        }

        console.log("store data  -->  ", storeData)

        await insertAmazonData(storeData);
        return storeData;
    } catch (e) {
        console.error("Unable to fetch orders from Amazon");
        console.error(e);
        throw e;
    }

};