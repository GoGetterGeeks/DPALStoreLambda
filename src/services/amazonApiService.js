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
    status: AMAZON_ORDER_STATUS_TO_DPAL_STATUS_MAP.get(order.OrderStatus),
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
            for (const orderItem of orderItems) {
                storeData.push(processOrderData(order, orderItem));
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

export const fetchUnshippedOrdersAndUpdate = async () => {
    try {
        const unshippedOrders = await getByStatus("unshipped");
        const amazonOrderIds = unshippedOrders.map(order => order.amazonOrderId);

        console.log("unshipped amazon ids -> ", amazonOrderIds)

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

        console.log('Fetching inventory to check status');
        let response = await sellingPartner.callAPI(query);

        for (const order of response.Orders) {
            const orderItems = await fetchOrderItems(sellingPartner, order.AmazonOrderId);

            for (const orderItem of orderItems) {
                const localOrder = unshippedOrders.find(o => 
                    o.amazonOrderId === order.AmazonOrderId && o.orderItemId === orderItem.OrderItemId
                );
                if (!localOrder) continue;

                const currentStatus = order.OrderStatus;
                if (localOrder.status !== currentStatus.toLowerCase()) {
                    console.log(
                        `Status change detected for Order ID ${order.AmazonOrderId}: ` +
                        `Local: ${localOrder.status}, Amazon: ${currentStatus}`
                    );

                    await updateOrderItemData(orderItem, order.AmazonOrderId, currentStatus.toLowerCase());
                    console.log(`Updated status for Order ID ${order.AmazonOrderId} to ${currentStatus.toLowerCase()}.`);
                } else {
                    console.log(`No missmatch found`);
                }
            }
        }

    } catch (e) {
        console.error("Unable to fetch orders from Amazon");
        console.error(e);
        throw e;
    }
};