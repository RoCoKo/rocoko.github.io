function displayResults(results) {
    try {
        var resultsContainer = document.getElementById("results");
        resultsContainer.innerHTML = "";

        if (results.length === 0) {
            resultsContainer.innerHTML = "<p>No results found.</p>";
            return;
        }

        results.forEach(function (mod) {
            var modElement = document.createElement("div");
            modElement.classList.add("mod-item");

            var link = document.createElement("a");
            link.href = "modpage.html?name=" + encodeURIComponent(mod.name);
            link.classList.add("mod-link");

            var uniqueMinecraftVersions = [...new Set(mod.versions.map(version => version.minecraftVersion))];
            link.textContent = mod.name + " - " + uniqueMinecraftVersions.join(", ");
            modElement.appendChild(link);

            var authorElement = document.createElement("p");
            authorElement.classList.add("mod-author");
            authorElement.textContent = "Author: " + mod.author;
            modElement.appendChild(authorElement);

            var descriptionElement = document.createElement("p");
            descriptionElement.classList.add("mod-description");
            descriptionElement.textContent = "Description: " + mod.description;
            modElement.appendChild(descriptionElement);

            resultsContainer.appendChild(modElement);
        });
    } catch (error) {
        console.error("Error in displayResults:", error);
    }
}

function searchMods() {
    try {
        var searchQuery = document.getElementById("search-bar").value.trim().toLowerCase();
        var category = document.getElementById("search-dropdown").value;

        if (searchQuery === "") {
            alert("Please enter a search term.");
            return;
        }

        var filteredMods = modList.filter(function(mod) {
            return (
                (category === "all" || mod.versions.some(v => v.minecraftVersion === category)) &&
                mod.name.toLowerCase().includes(searchQuery)
            );
        });

        displayResults(filteredMods);
    } catch (error) {
        console.error("Error in searchMods:", error);
    }
}
