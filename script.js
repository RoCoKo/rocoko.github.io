let PAGE_SIZE = 20;
let currentPage = 1;
let totalPages = 0;
let leaderboardData = [];

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
    return 0;
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
        return in the last ${years} year${years > 1 ? 's' : ''};
    }
}

const locationMap = {
    1: 'Austria',
    2: 'Germany',
    3: 'Turkey',
    7: 'Italy',
    12: 'Spain',
    13: 'France',
    14: 'The Netherlands',
    16: 'Ireland',
    17: 'Hungary',
    18: 'Norway',
    19: 'Finland',
    20: 'Iceland',
    21: 'Russia',
    22: 'Switzerland',
    23: 'United Kingdom',
    24: 'Portugal',
    25: 'Greece',
    28: 'Belgium',
    33: 'Denmark',
    34: 'Poland',
    35: 'Czech Republic',
    36: 'Slovakia',
    38: 'Croatia',
    39: 'Bosnia and Herzegovina',
    44: 'Estonia',
    45: 'Latvia',
    46: 'Belarus',
    47: 'Ukraine',
    48: 'Moldova',
    49: 'Romania',
    50: 'Bulgaria',
    51: 'Sweden',
    52: 'Georgia',
    54: 'Azerbaijan',
    55: 'Cyprus',
    56: 'Lithuania',
    58: 'Canada',
    61: 'Brazil',
    62: 'Argentina',
    63: 'Bolivia',
    64: 'Colombia',
    66: 'Guiana',
    67: 'Paraguay',
    68: 'Peru',
    70: 'Uruguay',
    71: 'Venezuela',
    72: 'French Guiana',
    73: 'Chile',
    74: 'Alaska',
    75: 'Greenland',
    76: 'Hawaii',
    79: 'California',
    80: 'Nevada',
    83: 'Arizona',
    84: 'Montana',
    86: 'Colorado',
    91: 'Kansas',
    92: 'Oklahoma',
    93: 'Texas',
    92: 'Oklahoma',
    100: 'Illinois',
    105: 'Tennessee',
    113: 'Rhode Island',
    114: 'New York',
    116: 'New Jersey',
    124: 'South Carolina',
    125: 'Georgia (USA)',
    126: 'Florida',
    127: 'Mexico',
    128: 'Bahamas',
    130: 'Dominican Republic',
    131: 'Haiti',
    132: 'Cuba',
    138: 'Panama',
    141: 'Victoria',
    143: 'Western Australia',
    144: 'Northern Territory',
    145: 'South Australia',
    146: 'Queensland',
    147: 'Tasmania',
    148: 'New South Wales',
    149: 'New Zealand',
    151: 'Oman',
    153: 'Saudi Arabia',
    159: 'Iraq',
    166: 'Pakistan',
    167: 'Afghanistan',
    172: 'Kazakhstan',
    173: 'Nepal',
    174: 'India',
    177: 'Myanmar',
    178: 'Thailand',
    180: 'Laos',
    182: 'Malaysia',
    183: 'Brunei',
    184: 'Philippines',
    186: 'China',
    187: 'North Korea',
    188: 'South Korea',
    189: 'Japan',
    201: 'Ivory Coast',
    205: 'Togo',
    212: 'Egypt',
    216: 'Gabon',
    219: 'Democratic Republic of the Congo',
    221: 'Burundi',
    222: 'Angola',
    223: 'Zambia',
    225: 'Belarus',
    226: 'South Africa',
    227: 'Zimbabwe',
    230: 'Madagascar',
    232: 'Uganda',
    234: 'Somalia',
    239: 'Swaziland',
};

function updateTable(page) {
    const tableBody = document.querySelector('#leaderboard tbody');
    tableBody.innerHTML = '';

    const start = (page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, leaderboardData.length);
    const pageData = leaderboardData.slice(start, end);

    pageData.forEach((player, index) => {
        const rank = start + index + 1;
        const lastOnlineRelative = formatRelativeTime(player.last_ping_time);
        const level = getLevel(player.xp);
        const location = locationMap[player.location_id] || 'Unknown';

        const row = document.createElement('tr');
        row.innerHTML = 
            <td>${rank}</td>
            <td>${player.username}</td>
            <td>${player.hi_player_id}</td>
            <td>${lastOnlineRelative}</td>
            <td>${level}</td>
            <td>${location}</td>
        ;
        tableBody.appendChild(row);
    });

    document.querySelector('#pageInfo').textContent = Page ${page} of ${totalPages};
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