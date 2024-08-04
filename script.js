// Constants for pagination
let PAGE_SIZE = 10;  // Default page size
let currentPage = 1;
let totalPages = 0;
let leaderboardData = [];

// XP required to advance from one level to the next
const xpToNextLevel = [
    15, 20, 25, 40, 65, 100, 155, 225, 315, 435, 600, 800, 1075, 1415, 1835, 2345,
    2950, 3650, 4425, 5300, 6300, 7350, 8525, 9785, 11150, 12600, 14200, 15850,
    17600, 19500, 21500, 23500, 25750, 28000, 30500, 33000, 35600, 38500, 41000,
    44000, 47000, 50500, 54000, 57500, 61000, 65000, 73500, 78000, 83000, 88500,
    94000, 100000, 106000, 113000, 120000, 128000, 135000, 145000, 155000, 167000,
    182000, 200000, 225000, 260000, 315000, 395000, 510000, 690000, 960000,
    1400000, 2050000, 3150000, 5000000, 7800000, 11800000, 17600000, 26000000,
    38235000, 52960000, 72220000, 100822000, 131700000, 175600000, 233360000,
    308700000, 407820000, 535260000, 700000000, 934600000, 1200000000, 1500000000,
    1900000000, 2400000000, 3000000000, 3500000000, 4000000000, 4500000000,
    5000000000, 6000000000
];

// Calculate cumulative XP for each level
const cumulativeXP = [];
let totalXP = 0;
for (let i = 0; i < xpToNextLevel.length; i++) {
    totalXP += xpToNextLevel[i];
    cumulativeXP.push(totalXP);
}

function getLevel(xp) {
    for (let i = cumulativeXP.length - 1; i >= 0; i--) {
        if (xp >= cumulativeXP[i]) {
            return i + 2;
        }
    }
    return 0; // Level 0 if XP is below the first level's requirement
}

function formatRelativeTime(timestamp) {
    const now = Date.now();
    const lastOnlineDate = new Date(timestamp * 1000);
    const diff = now - lastOnlineDate.getTime(); // Difference in milliseconds

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

// Location mapping
const locationMap = {
    2: 'Germany',
    3: 'Turkey',
    7: 'Italy',
    13: 'France',
    21: 'Russia',
    12: 'Spain',
    14: 'The Netherlands',
    17: 'Hungary',
    23: 'United Kingdom',
    24: 'Portugal',
    34: 'Poland',
    46: 'Belarus',
    47: 'Ukraine',
    54: 'Azerbaijan',
    61: 'Brazil',
    62: 'Argentina',
    64: 'Colombia',
    73: 'Chile',
    92: 'Oklahoma',
    93: 'Texas',
    92: 'Oklahoma',
    116: 'New Jersey',
    124: 'South Carolina',
    127: 'Mexico',
    143: 'West Australia',
    147: 'Tasmania',
    148: 'New South Wales',
    167: 'Afghanistan',
    174: 'India',
    184: 'Philippines',
    225: 'Belarus'
};

function updateTable(page) {
    const tableBody = document.querySelector('#leaderboard tbody');
    tableBody.innerHTML = '';

    const start = (page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, leaderboardData.length);
    const pageData = leaderboardData.slice(start, end);

    pageData.forEach(player => {
        const lastOnlineRelative = formatRelativeTime(player.last_ping_time);
        const level = getLevel(player.xp);
        const location = locationMap[player.location_id] || 'Unknown';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${player.username}</td>
            <td>${player.hi_player_id}</td>
            <td>${lastOnlineRelative}</td>
            <td>${level}</td>
            <td>${location}</td>
        `;
        tableBody.appendChild(row);
    });

    document.querySelector('#pageInfo').textContent = `Page ${page} of ${totalPages}`;
    document.querySelector('#prevPage').classList.toggle('disabled', page === 1);
    document.querySelector('#nextPage').classList.toggle('disabled', page === totalPages);
}

function changePageSize(newSize) {
    PAGE_SIZE = newSize;
    totalPages = Math.ceil(leaderboardData.length / PAGE_SIZE);
    currentPage = 1;
    updateTable(currentPage);
}

async function loadLeaderboard() {
    try {
        const response = await fetch('data.json');
        leaderboardData = await response.json();
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

        // Event listeners for page size buttons
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
    } catch (error) {
        console.error('Error loading leaderboard data:', error);
    }
}

window.onload = loadLeaderboard;
