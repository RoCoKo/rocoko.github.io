import { locationMap, xpToNextLevel } from './constants.js';

let PAGE_SIZE = 10;
let currentPage = 1;
let totalPages = 0;
let leaderboardData = [];

const cumulativeXP = [];
let totalXP = 0;
for (let i = 0; i < xpToNextLevel.length; i++) {
    totalXP += xpToNextLevel[i];
    cumulativeXP.push(totalXP);
}

const svgTemplate = `
<svg width="254" height="99" viewBox="0 0 67.204166 26.19375" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Define the gradient -->
    <linearGradient id="backgroundGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#efe190;stop-opacity:1;" />
      <stop offset="100%" style="stop-color:#ecc767;stop-opacity:1;" />
    </linearGradient>
  </defs>
  <g>
    <!-- Background rectangle with gradient -->
    
    
    <!-- Existing path and text elements -->
    <path style="fill:#ffffff;" d="M 2.1152344,0 C 0.94831555,0 0,0.94831555 0,2.1152344 V 24.080078 c 0,1.166919 0.94831558,2.113281 2.1152344,2.113281 H 65.096124 c 1.166919,0 2.115235,-0.946362 2.115235,-2.113281 V 2.1152344 C 67.211359,0.94831558 66.263043,0 65.096124,0 Z m 0,0.52539062 H 65.096124 c 0.885186,0 1.589844,0.70465818 1.589844,1.58984378 V 24.080078 c 0,0.885185 -0.704658,1.587891 -1.589844,1.587891 H 2.1152344 c -0.8851856,0 -1.58984378,-0.702706 -1.58984378,-1.587891 V 2.1152344 c 0,-0.8851856 0.70465818,-1.58984378 1.58984378,-1.58984378 z" />
    <text x="2.4321535" y="24.321526" style="font-weight:bold;font-size:3.52777px;">Rank {{rank}}</text>
    <text x="21.889374" y="10.102788" style="font-weight:bold;font-size:3.52777px;">ID</text>
    <text x="21.889374" y="4.4317708" style="font-weight:bold;font-size:3.52777px;">{{username}}</text>
    <text x="43.063187" y="14.865179" style="font-size:3.52778px;">{{id}}</text>
    <text x="21.889374" y="14.865277" style="font-size:3.52777px;">XP</text>
    <text x="43.063187" y="10.102675" style="font-size:3.52778px;">{{xp}}</text>
    <text x="21.889374" y="19.627768" style="font-size:3.52777px;">Last Seen</text>
    <text x="43.063187" y="19.627682" style="font-size:3.52778px;">{{lastSeen}}</text>
    <text x="21.889374" y="24.390257" style="font-size:3.52777px;">Location</text>
    <text x="43.063187" y="24.390184" style="font-size:3.52778px;">{{location}}</text>
  </g>
</svg>`;


function getLevel(xp) {
    if (xp < 0) return 0;

    for (let i = 0; i < cumulativeXP.length; i++) {
        if (xp < cumulativeXP[i]) {
            return i + 1;
        }
    }
    return cumulativeXP.length;
}

function formatRelativeTime(timestamp) {
    const now = Date.now();
    const lastOnlineDate = new Date(timestamp * 1000);
    const diff = now - lastOnlineDate.getTime();

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (days <= 7) {
        return 'in the last 7 days';
    } else if (days <= 30) {
        return 'in the last 30 days';
    } else if (days <= 180) {
        return 'in the last 6 months';
    } else if (days <= 365) {
        return 'in the last year';
    } else {
        return `in the last ${years} year${years > 1 ? 's' : ''}`;
    }
}

function updateTable(page, data = leaderboardData) {
    const tableBody = document.querySelector('#leaderboard tbody');
    tableBody.innerHTML = '';

    const start = (page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, data.length);
    const pageData = data.slice(start, end);

    pageData.forEach((player, index) => {
        const username = player.username;
        const rank = start + index + 1;
        const lastOnlineRelative = formatRelativeTime(player.last_ping_time);
        const level = getLevel(player.xp);
        const location = locationMap[player.location_id] || 'Unknown';

        const row = document.createElement('tr');

        const card = createPlayerCard({
            username,
            rank,
            id: player.hi_player_id,
            xp: player.xp,
            lastSeen: lastOnlineRelative,
            location
        });

        // Insert the card into a table cell
        const cell = document.createElement('td');
        cell.appendChild(card);
        row.appendChild(cell);

        tableBody.appendChild(row);
    });

    totalPages = Math.ceil(data.length / PAGE_SIZE);
    document.querySelector('#pageInfo').textContent = `Page ${page} of ${totalPages}`;

    document.querySelector('#firstPage').classList.toggle('disabled', page === 1);
    document.querySelector('#prevPage').classList.toggle('disabled', page === 1);
    document.querySelector('#nextPage').classList.toggle('disabled', page === totalPages);
    document.querySelector('#lastPage').classList.toggle('disabled', page === totalPages);
}

function changePageSize(newSize) {
    PAGE_SIZE = newSize;
    totalPages = Math.ceil(leaderboardData.length / PAGE_SIZE);
    currentPage = 1;
    updateTable(currentPage);
}

function handleSearch() {
    const searchQuery = document.querySelector('#searchInput').value.toLowerCase();
    const filteredData = leaderboardData.filter(player =>
        player.username.toLowerCase().includes(searchQuery) ||
        player.hi_player_id.toLowerCase().includes(searchQuery)
    );
    currentPage = 1;
    totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
    updateTable(currentPage, filteredData);
}

function createPlayerCard(player) {
    const svgContent = svgTemplate
        .replace('{{username}}', player.username)
        .replace('{{rank}}', player.rank)
        .replace('{{id}}', player.id)
        .replace('{{xp}}', player.xp)
        .replace('{{lastSeen}}', player.lastSeen)
        .replace('{{location}}', player.location);

    // Create an SVG element
    const svgElement = new DOMParser().parseFromString(svgContent, 'image/svg+xml').documentElement;

    const wrapper = document.createElement('div');
    wrapper.className = 'player-card';
    wrapper.appendChild(svgElement);

    return svgElement;
}


document.addEventListener('DOMContentLoaded', function () {
    const loadingElement = document.getElementById('loading');

    function simulateLoading() {
        if (loadingElement) {
            loadingElement.style.display = 'flex';
            setTimeout(() => {
                loadingElement.style.display = 'none';
            }, 1000);
        }
    }

    window.addEventListener('load', function () {
        simulateLoading();
    });
});

async function loadLeaderboard() {
    try {
        const response = await fetch('/src/data/data.json.gz');
        const compressedData = await response.arrayBuffer();
        const decompressedData = pako.inflate(compressedData, { to: 'string' });
        leaderboardData = JSON.parse(decompressedData);

        leaderboardData.sort((a, b) => b.xp - a.xp);

        totalPages = Math.ceil(leaderboardData.length / PAGE_SIZE);
        updateTable(currentPage);

        document.querySelector('#prevPage').addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                updateTable(currentPage);
            }
        });

        document.querySelector('#nextPage').addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                updateTable(currentPage);
            }
        });

        document.querySelector('#pageSize10').addEventListener('click', () => {
            changePageSize(10);
            document.querySelectorAll('.page-size-buttons button').forEach(btn => btn.classList.remove('active'));
            document.querySelector('#pageSize10').classList.add('active');
        });

        document.querySelector('#pageSize20').addEventListener('click', () => {
            changePageSize(20);
            document.querySelectorAll('.page-size-buttons button').forEach(btn => btn.classList.remove('active'));
            document.querySelector('#pageSize20').classList.add('active');
        });

        document.querySelector('#pageSize50').addEventListener('click', () => {
            changePageSize(50);
            document.querySelectorAll('.page-size-buttons button').forEach(btn => btn.classList.remove('active'));
            document.querySelector('#pageSize50').classList.add('active');
        });

        document.querySelector('#pageSize100').addEventListener('click', () => {
            changePageSize(100);
            document.querySelectorAll('.page-size-buttons button').forEach(btn => btn.classList.remove('active'));
            document.querySelector('#pageSize100').classList.add('active');
        });

        document.querySelector('#searchButton').addEventListener('click', () => {
            handleSearch();
        });

        document.querySelector('#searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSearch();
            }
        });

        document.querySelector('#firstPage').addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage = 1;
                updateTable(currentPage);
            }
        });

        document.querySelector('#lastPage').addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage = totalPages;
                updateTable(currentPage);
            }
        });
    } catch (error) {
        console.error('Error loading leaderboard data:', error);
    }
}

window.onload = loadLeaderboard;
