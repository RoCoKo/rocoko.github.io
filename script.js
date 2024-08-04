let PAGE_SIZE = 20;
let currentPage = 1;
let totalPages = 0;
let leaderboardData = [];
let filteredData = [];
const locationMap = {
    // Add your location mapping here...
};

function getLevel(xp) {
    // Implement your getLevel function here...
}

function formatRelativeTime(timestamp) {
    // Implement your formatRelativeTime function here...
}

function updateTable(page) {
    const tableBody = document.querySelector('#leaderboard tbody');
    tableBody.innerHTML = '';

    const start = (page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, leaderboardData.length);
    const pageData = leaderboardData.slice(start, end);

    pageData.forEach((player, index) => {
        const rank = start + index + 1;
        const lastOnlineRelative = player.last_ping_time ? formatRelativeTime(player.last_ping_time) : 'Unknown';
        const level = player.xp ? getLevel(player.xp) : 'Unknown';
        const location = locationMap[player.location_id] || 'Unknown';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${rank}</td>
            <td>${player.username || 'N/A'}</td>
            <td>${player.hi_player_id || 'N/A'}</td>
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


function filterData() {
    const searchTerm = document.querySelector('#searchBar').value.toLowerCase();
    const selectedCountry = document.querySelector('#countryFilter').value;
    
    filteredData = leaderboardData.filter(player => {
        const matchesSearch = player.username.toLowerCase().includes(searchTerm);
        const matchesCountry = selectedCountry === '' || locationMap[player.location_id] === selectedCountry;
        return matchesSearch && matchesCountry;
    });

    totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
    currentPage = 1;
    updateTable(currentPage);
}

function changePageSize(newSize) {
    PAGE_SIZE = newSize;
    totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
    currentPage = 1;
    updateTable(currentPage);
}

async function loadLeaderboard() {
    try {
        const response = await fetch('data.json');
        leaderboardData = await response.json();
        leaderboardData.sort((a, b) => b.xp - a.xp);
        
        // Populate country filter options
        const countryFilter = document.querySelector('#countryFilter');
        const uniqueCountries = [...new Set(leaderboardData.map(player => locationMap[player.location_id]))];
        uniqueCountries.forEach(country => {
            if (country) {
                const option = document.createElement('option');
                option.value = country;
                option.textContent = country;
                countryFilter.appendChild(option);
            }
        });

        // Initial filter and update
        filterData();
        
        // Event listeners for pagination and page size
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

        document.querySelector('#searchBar').addEventListener('input', filterData);
        document.querySelector('#countryFilter').addEventListener('change', filterData);

    } catch (error) {
        console.error('Error loading leaderboard data:', error);
    }
}

window.onload = loadLeaderboard;
