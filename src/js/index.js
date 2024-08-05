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
        const rank = start + index + 1;
        const lastOnlineRelative = formatRelativeTime(player.last_ping_time);
        const level = getLevel(player.xp);
        const location = locationMap[player.location_id] || 'Unknown';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${rank}</td>
            <td>${player.username}</td>
            <td>${player.hi_player_id}</td>
            <td>${lastOnlineRelative}</td>
            <td>${level}</td>
            <td>${location}</td>
            `;
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

async function loadLeaderboard() {
    try {
        const response = await fetch('data.json.gz');
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
