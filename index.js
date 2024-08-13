require('dotenv').config();
const fs = require('fs'); // Required to read files
const readline = require('readline');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const OpenAI = require('openai');

// Initialize OpenAI API with the API key directly
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox'],
    }
});

let knowledgeBase = ''; // Variable to store the knowledge base content
const defaultKnowledgeBase = 'default'; // Default knowledge base file name
let currentKnowledgeBase = defaultKnowledgeBase; // Track the current knowledge base in use

// Function to load the knowledge base
function loadKnowledgeBase(kbName) {
    const kbFilePath = `${kbName}.txt`;
    if (fs.existsSync(kbFilePath)) {
        knowledgeBase = fs.readFileSync(kbFilePath, 'utf8');
        currentKnowledgeBase = kbName;
        console.log(`Loaded knowledge base from ${kbFilePath}`);
        return true;
    } else {
        console.error(`Knowledge base file "${kbFilePath}" not found!`);
        return false;
    }
}

// Load the default knowledge base at startup
loadKnowledgeBase(defaultKnowledgeBase);

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
});

// Existing bot control code
let isBotActive = true;
let pingInterval;

function stopBot() {
    isBotActive = false;
    console.log('Bot has been paused.');
}

function startBot() {
    isBotActive = true;
    console.log('Bot is now active.');
}

function startPinging() {
    pingInterval = setInterval(() => {
        client.sendMessage('923261467086@c.us', 'Pinging');
        console.log('Sent "Pinging" to 923261467086@c.us');
    }, 240000); // 240 seconds = 4 minutes
}

function stopPinging() {
    clearInterval(pingInterval);
    console.log('Stopped pinging.');
}

function showMenu() {
    return `
    *Commands Menu:*
    - !!stop: Pause the bot
    - !!start: Resume the bot
    - !!ping: Start pinging 923467467086@c.us every 240 seconds
    - !!menu: Show this command menu
    - !!remind: Please use !!remind "number" "message" "x:y" (e.g., !!remind "923261467086" "Please pay your due." "00:01").
    - !!knowledgebase "name": Switch to the specified knowledge base.
    `;
}

const parseTimeString = (timeString) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return (hours * 60 * 60 * 1000) + (minutes * 60 * 1000); // Convert to milliseconds
};

const setReminder = (number, message, time) => {
    const delay = parseTimeString(time);

    setTimeout(() => {
        client.sendMessage(number + '@c.us', message);
        console.log(`Reminder sent to ${number}: ${message}`);
    }, delay);
};

client.on('message', async (message) => {
    const senderId = message.from;
    const messageText = message.body.toLowerCase();

    // Extract the phone number from the senderId (before '@')
    const senderNumber = senderId.split('@')[0];

    // Allow only commands from these specific numbers
    if (senderNumber === '923499490427' || senderNumber === '923261467086') {
        if (messageText.startsWith('!!remind')) {
            const parts = message.body.split('"');
            if (parts.length === 7) {
                const targetNumber = parts[1];
                const reminderMessage = parts[3];
                const time = parts[5];
                setReminder(targetNumber, reminderMessage, time);
            } else {
                message.reply('Incorrect format. Please use !!remind "number" "message" "x:y" (e.g., !!remind "923467467086" "Please pay your due." "00:01").');
            }
            return;
        }

        if (messageText.startsWith('!!knowledgebase')) {
            const kbName = message.body.split('"')[1];
            if (kbName) {
                if (loadKnowledgeBase(kbName)) {
                    message.reply(`Switched to knowledge base "${kbName}".`);
                } else {
                    message.reply(`Knowledge base "${kbName}" does not exist.`);
                }
            } else {
                message.reply('Please specify the knowledge base name like !!knowledgebase "name".');
            }
            return;
        }

        switch (messageText) {
            case '!!stop':
                stopBot();
                message.reply('Bot has been paused.');
                return;
            case '!!start':
                startBot();
                message.reply('Bot is now active.');
                return;
            case '!!ping':
                startPinging();
                message.reply('Started pinging 923467467086@c.us every 240 seconds.');
                return;
            case '!!menu':
                message.reply(showMenu());
                return;
            default:
                break;
        }
    }

    if (isBotActive) {
        try {
            const userQuery = message.body.toLowerCase();
            const reply = await generateResponse(userQuery, knowledgeBase);
            message.reply(reply);
        } catch (error) {
            console.error('Error while processing the message:', error);
            message.reply("Sorry, something went wrong while processing your request.");
        }
    } else {
        console.log('Bot is paused, no response sent.');
    }
});

client.on('error', error => {
    console.error('An error occurred:', error);
});

// Function to generate a response using OpenAI
async function generateResponse(userQuery, knowledgeBase) {
    // Combine user query with the knowledge base content
    const prompt = `
    
    KnowledgeBase:\n${knowledgeBase}\n\nUser Query: ${userQuery}\n\nResponse:`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
    });

    return response.choices[0].message.content.trim();
}

// User message history to track last 10 messages
const userMessageHistory = {};

function getLastTenMessages(senderId, newMessage) {
    if (!userMessageHistory[senderId]) {
        userMessageHistory[senderId] = [];
    }
    userMessageHistory[senderId].push(newMessage);
    
    // Ensure we only keep the last 10 messages
    if (userMessageHistory[senderId].length > 10) {
        userMessageHistory[senderId].shift();
    }
    
    return userMessageHistory[senderId].join('\n');
}

client.initialize();


