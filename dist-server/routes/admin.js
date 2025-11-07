import express from "express";
import { prisma } from "../lib/prisma.js";
const router = express.Router();
// Get business information by username
router.get("/business/:username", async (req, res) => {
    try {
        const { username } = req.params;
        if (!username) {
            return res.status(400).send("Username is required");
        }
        const user = await prisma.user.findUnique({
            where: { username },
            select: {
                username: true,
                name: true,
                locations: true
            }
        });
        if (!user) {
            return res.status(404).send("Business user not found");
        }
        res.json({
            user: {
                username: user.username,
                name: user.name,
                locations: user.locations || []
            }
        });
    }
    catch (error) {
        console.error("Error fetching business:", error);
        res.status(500).send("Internal server error");
    }
});
// Update business credits
router.post("/update-credits", async (req, res) => {
    try {
        const { username, baseCustomerCredits, baseSMSCredits } = req.body;
        // Validate input
        if (!username || baseCustomerCredits === undefined || baseSMSCredits === undefined) {
            return res.status(400).send("Missing required fields");
        }
        if (typeof baseCustomerCredits !== 'number' || typeof baseSMSCredits !== 'number') {
            return res.status(400).send("Credits must be numbers");
        }
        if (baseCustomerCredits < 0 || baseSMSCredits < 0) {
            return res.status(400).send("Credits cannot be negative");
        }
        // Find and update the user
        const user = await prisma.user.findUnique({
            where: { username }
        });
        if (!user) {
            return res.status(404).send("Business user not found");
        }
        const updatedUser = await prisma.user.update({
            where: { username },
            data: {
                baseCustomerCredits,
                baseSMSCredits,
                updatedAt: new Date()
            }
        });
        res.json({
            message: "Credits updated successfully",
            user: {
                username: updatedUser.username,
                baseCustomerCredits: updatedUser.baseCustomerCredits,
                baseSMSCredits: updatedUser.baseSMSCredits
            }
        });
    }
    catch (error) {
        console.error("Error updating credits:", error);
        res.status(500).send("Internal server error");
    }
});
// Add credits to specific business location
router.post("/add-location-credits", async (req, res) => {
    try {
        const { username, locationAddress, customerCredits, smsCredits } = req.body;
        // Validate input
        if (!username || !locationAddress) {
            return res.status(400).send("Business username and location address are required");
        }
        if (customerCredits === undefined && smsCredits === undefined) {
            return res.status(400).send("At least one of customerCredits or smsCredits must be provided");
        }
        if ((customerCredits !== undefined && typeof customerCredits !== 'number') ||
            (smsCredits !== undefined && typeof smsCredits !== 'number')) {
            return res.status(400).send("Credits must be numbers");
        }
        if ((customerCredits !== undefined && customerCredits < 0) ||
            (smsCredits !== undefined && smsCredits < 0)) {
            return res.status(400).send("Credits cannot be negative");
        }
        // Find the user
        const user = await prisma.user.findUnique({
            where: { username }
        });
        if (!user) {
            return res.status(404).send("Business user not found");
        }
        // Get the locations array
        const locations = user.locations || [];
        // Find the location by address
        const locationIndex = locations.findIndex((loc) => loc.address === locationAddress);
        if (locationIndex === -1) {
            return res.status(404).send("Location not found for this business");
        }
        // Update the location credits by adding the specified amounts
        const location = locations[locationIndex];
        if (customerCredits !== undefined) {
            location.customerCredits = (location.customerCredits || 0) + customerCredits;
        }
        if (smsCredits !== undefined) {
            location.smsCredits = (location.smsCredits || 0) + smsCredits;
        }
        // Update the locations array
        locations[locationIndex] = location;
        // Save the updated locations
        const updatedUser = await prisma.user.update({
            where: { username },
            data: {
                locations: locations,
                updatedAt: new Date()
            }
        });
        res.json({
            message: "Credits added successfully",
            location: {
                address: location.address,
                customerCredits: location.customerCredits,
                smsCredits: location.smsCredits
            }
        });
    }
    catch (error) {
        console.error("Error adding location credits:", error);
        res.status(500).send("Internal server error");
    }
});
export default router;
