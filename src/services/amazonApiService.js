import SellingPartner from 'amazon-sp-api';
import { insertAmazonData, getByStatus, updateOrderItemData } from '../dao/amazonSellerDao.js';
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

const getSellingPartnerInstance = () => {
    const spConfig = {
        region: "na",
        refresh_token: process.env.REFRESH_TOKEN,
        credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: process.env.AMAZON_SP_CLIENT_ID,
            SELLING_PARTNER_APP_CLIENT_SECRET: process.env.AMAZON_SP_CLIENT_SECRET,
        },
    };
    return new SellingPartner(spConfig);
};

const fetchOrderItems = async (sellingPartner, amazonOrderId) => {
    const response = await sellingPartner.callAPI({
        operation: "getOrderItems",
        endpoint: "orders",
        path: { orderId: amazonOrderId },
        query: { NextToken: null },
    });

    return response.OrderItems || [];
};

const processOrderData = (order, orderItem) => ({
    orderItemId: orderItem.OrderItemId,
    amazonOrderId: order.AmazonOrderId,
    sku: orderItem.SellerSKU,
    purchaseDate: order.PurchaseDate,
    quantity: orderItem.QuantityOrdered,
    latestShipDate: order.LatestShipDate,
    earliestShipDate: order.EarliestShipDate,
    shippingAddress: order.ShippingAddress,
    orderStatus: AMAZON_ORDER_STATUS_TO_DPAL_STATUS_MAP.get(order.OrderStatus),
});

export const fetchInventoryAndInsert = async () => {
    try {
        const sellingPartner = getSellingPartnerInstance();

        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() - 1);
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

        console.log('Fetching inventory before inserting data');
        let response = await sellingPartner.callAPI(query);

        let storeData = [];
        for (const order of response.Orders) {
            const orderItems = await fetchOrderItems(sellingPartner, order.AmazonOrderId);
            orderItems.forEach(orderItem => {
                storeData.push(processOrderData(order, orderItem));
            });
        }

        console.log(`Fetched ${storeData.length} store data, inserting into database`); 
        await insertAmazonData(storeData);

        return storeData;
    } catch (e) {
        console.error("Unable to fetch or insert orders from Amazon");
        console.error(e);
        throw e;
    }
};

const fetchOrdersByMultipleStatuses = async () => {
    try {
        const [scrappedOrders, unscrappedOrders] = await Promise.all([
            getByStatus("unshipped_scrapped"),
            getByStatus("unshipped_unscrapped"),
        ]);

        const allOrders = [...scrappedOrders, ...unscrappedOrders];

        console.log(`Fetched ${allOrders.length} total orders.`);
        return allOrders;
    } catch (error) {
        console.error('Error fetching orders by multiple statuses:', error);
        throw error;
    }
};

export const fetchUnshippedOrdersAndUpdate = async () => {
    try {
        const unshippedOrders = await fetchOrdersByMultipleStatuses();
        const amazonOrderIds = unshippedOrders.map(order => order.amazonOrderId);

        if (amazonOrderIds.length === 0) {
            console.log("No unshipped orders found.");
            return;
        }

        const sellingPartner = getSellingPartnerInstance();

        const query = {
            operation: "getOrders",
            endpoint: "orders",
            query: {
                MarketplaceIds: "ATVPDKIKX0DER",
                AmazonOrderIds: amazonOrderIds
            }
        };

        console.log("Fetching unshipped orders from Amazon");
        let response = await sellingPartner.callAPI(query);

        for (const order of response.Orders) {
            const orderItems = await fetchOrderItems(sellingPartner, order.AmazonOrderId);

            for (const orderItem of orderItems) {
                const localOrder = unshippedOrders.find(o => 
                    o.amazonOrderId === order.AmazonOrderId && o.orderItemId === orderItem.OrderItemId
                );
                if (!localOrder) continue;

                const currentStatus = order.OrderStatus;
                if (localOrder.orderStatus !== currentStatus.toLowerCase()) {
                    console.log(
                        `Status change detected for Order ID ${order.AmazonOrderId}: ` +
                        `Local: ${localOrder.orderStatus}, Amazon: ${currentStatus}`
                    );

                    await updateOrderItemData(orderItem, order.AmazonOrderId, currentStatus.toLowerCase());
                    console.log(`Updated status for Order ID ${order.AmazonOrderId} to ${currentStatus.toLowerCase()}.`);
                } else {
                    console.log(`No mismatch found for Order ID ${order.AmazonOrderId}`);
                }
            }
        }

    } catch (e) {
        console.error("Unable to fetch or update orders from Amazon");
        console.error(e);
        throw e;
    }
};