// src/index.ts

import { app } from "@azure/functions";
import { getUserDataHandler } from "./functions/getUserData";
import { getUserProfile } from "./functions/getUserProfile";

// Register the getUserData function
app.http("getUserData", {
    methods: ["POST"],
    authLevel: "function",
    handler: getUserDataHandler,
});

// Register the getUserProfile function
app.http("getUserProfile", {
    methods: ["POST"],
    authLevel: "function",
    handler: getUserProfile,
});

export default app;
