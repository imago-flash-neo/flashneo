'use strict';

// ####################################################################
// NEW CALL
// ####################################################################

/**
 * Get random number
 * @param {integer} length of string
 * @returns {string} random number
 */
function getRandomNumber() {
    const generatedRoomName = (Math.floor(10000000 + Math.random() * 90000000)).toString();
    return generatedRoomName;
}

// Typing Effect

let i = 0;
let num = getRandomNumber(); // Generate a random number string with 10 digits
let speed = 100;

/**
 * Set room name with typewriter effect
 */
function typeWriter() {
    if (i < num.length) {
        roomName.value += num.charAt(i);
        i++;
        setTimeout(typeWriter, speed);
    }
}

const roomName = document.getElementById('roomName');
if (roomName) {
    roomName.value = '';
    typeWriter();
}

// ####################################################################
// LANDING | NEW CALL
// ####################################################################

// Get elements from both sections
const roomNameInputs = document.querySelectorAll('#roomName');
const genRoomButtons = document.querySelectorAll('[id^="genRoomButton"]');
const joinRoomButtons = document.querySelectorAll('[id^="joinRoomButton"]');
const lastRoomContainer = document.getElementById('lastRoomContainer');
const lastRoom = document.getElementById('lastRoom');
const lastRoomName = window.localStorage.lastRoom ? window.localStorage.lastRoom : '';

// Display last room name if it exists
if (lastRoomContainer && lastRoom && lastRoomName) {
    lastRoomContainer.style.display = 'inline-flex';
    lastRoom.setAttribute('href', '/join/' + lastRoomName);
    lastRoom.innerText = lastRoomName;
}

// Add event listeners to all generate room buttons
genRoomButtons.forEach((genRoomButton, index) => {
    genRoomButton.onclick = (e) => {
        const newRoomName = getRandomNumber(); // Generate a random number
        roomNameInputs.forEach(input => input.value = newRoomName);
    };
});

// Add event listeners to all join room buttons
joinRoomButtons.forEach((joinRoomButton, index) => {
    joinRoomButton.onclick = (e) => {
        joinRoom();
    };
});

// Synchronize room name inputs on typing
roomNameInputs.forEach((input) => {
    input.oninput = (e) => {
        roomNameInputs.forEach(otherInput => {
            if (otherInput !== e.target) {
                otherInput.value = e.target.value;
            }
        });
    };
    input.onkeyup = (e) => {
        if (e.keyCode === 13) {
            e.preventDefault();
            joinRoom();
        }
    };
});

// Generate a unique room ID
function genRoom() {
    const newRoomName = getRandomNumber(); // Generate a random number string with 10 digits
    roomNameInputs.forEach(input => input.value = newRoomName);
}

// Join the room with the given name
function joinRoom() {
    const roomName = filterXSS(roomNameInputs[0].value); // Use the first input as reference
    if (roomName) {
        window.location.href = '/join/' + roomName;
        window.localStorage.lastRoom = roomName;
    } else {
        alert('Room name empty!\nPlease pick a room name.');
    }
}

// Handle adult content warning
function adultContent() {
    if (
        confirm(
            '18+ WARNING! ADULTS ONLY!\n\nExplicit material for viewing by adults 18 years of age or older. You must be at least 18 years old to access this site!\n\nProceeding you are agree and confirm to have 18+ year.',
        )
    ) {
        window.open('https://luvlounge.ca', '_blank');
    }
}


// #########################################################
// PERMISSIONS
// #########################################################

const qs = new URLSearchParams(window.location.search);
const room_id = filterXSS(qs.get('room_id'));
const message = filterXSS(qs.get('message'));
const showMessage = document.getElementById('message');
console.log('Allow Camera or Audio', {
    room_id: room_id,
    message: message,
});
if (showMessage) showMessage.innerHTML = message;
