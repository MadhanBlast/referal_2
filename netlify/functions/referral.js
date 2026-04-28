const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/onefiles";
let cachedClient = null;

async function connectToDatabase() {
    if (cachedClient) return cachedClient;
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    cachedClient = client;
    return client;
}

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "OK" };
    }

    try {
        const client = await connectToDatabase();
        const db = client.db();
        const users = db.collection("users");

        const { action } = event.queryStringParameters || {};

        if (event.httpMethod === "POST" && action === "register") {
            const { userId, referralId } = JSON.parse(event.body);

            if (!userId || !referralId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing credentials" }) };
            }

            // Check if user already exists
            const existingUser = await users.findOne({ userId });
            if (existingUser) {
                return { statusCode: 200, headers, body: JSON.stringify(existingUser) };
            }

            const newUser = {
                userId,
                referralId,
                referredBy: null,
                referralCount: 0,
                createdAt: new Date()
            };

            await users.insertOne(newUser);
            return { statusCode: 201, headers, body: JSON.stringify(newUser) };
        }

        if (event.httpMethod === "POST" && action === "apply") {
            const { userId, referralCode } = JSON.parse(event.body);

            if (!userId || !referralCode) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing request body" }) };
            }

            const targetUser = await users.findOne({ userId });
            if (!targetUser) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: "User not found" }) };
            }

            if (targetUser.referredBy) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Referral code already applied" }) };
            }

            // Ensure they are not referring themselves
            if (targetUser.referralId === referralCode) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Cannot refer yourself" }) };
            }

            const referrer = await users.findOne({ referralId: referralCode });
            if (!referrer) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: "Invalid referral code" }) };
            }

            // Update user: applied referral
            await users.updateOne({ userId }, { $set: { referredBy: referralCode } });

            // Update referrer: increment count
            await users.updateOne({ referralId: referralCode }, { $inc: { referralCount: 1 } });

            return { statusCode: 200, headers, body: JSON.stringify({ success: true, msg: "Referral applied" }) };
        }

        if (event.httpMethod === "GET") {
            const { userId } = event.queryStringParameters || {};
            if (!userId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing User ID" }) };
            }

            const user = await users.findOne({ userId });
            if (!user) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: "User not found" }) };
            }

            return { statusCode: 200, headers, body: JSON.stringify(user) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
        };
    }
};
