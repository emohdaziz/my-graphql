function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

async function fetchUserData(token, userId) {
  const query = `
    query ($userId: Int!) {
      user_by_pk(id: $userId) {
        login
        email
        firstName
        lastName
        auditRatio
        totalUp
        totalDown
        totalUpBonus
        auditsAssigned
      }
      xp_view(where: {userId: {_eq: $userId}}) {
        amount
        path
      }
      progress(where: { userId: { _eq: $userId } }, order_by: { createdAt: asc }) {
        path
        createdAt
        grade
      }
    }
  `;
  const res = await fetch('https://learn.reboot01.com/api/graphql-engine/v1/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { userId } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
  return json.data;
}

function formatXP(bytes) {
  if (bytes >= 1_000_000) {
    return (bytes / 1_000_000).toFixed(2) + ' MB';
  } else if (bytes >= 1_000) {
    return Math.round(bytes / 1_000) + ' kB';
  } else {
    return bytes + ' B';
  }
}

function parsePath(path) {
  const parts = path.toLowerCase().split('/');
  return {
    group: parts[2] || '',
    subproject: parts[3] || '',
    subsub: parts[4] || '',
  };
}

function filterXpByGroup(xpArray, group) {
  return xpArray.filter(xp => {
    if (!xp.path) return false;
    const { group: xpGroup, subproject, subsub } = parsePath(xp.path);

    if (group === 'bh-piscine') return xpGroup === 'bh-piscine';

    if (group === 'bh-module') {
      if (xpGroup !== 'bh-module') return false;
      if (subproject === 'piscine-js' && subsub) return false;
      return true;
    }

    if (group === 'piscine-js') {
      return xpGroup === 'bh-module' && subproject === 'piscine-js' && subsub;
    }

    return false;
  });
}

function lastSegment(path) {
  if (!path) return '';
  const parts = path.split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i]) return parts[i];
  }
  return '';
}

let attemptsPage = 0;
const attemptsPerPage = 10;

const CHART_HEIGHT = 250;
const TOP_PADDING = 30;
const BOTTOM_PADDING = 15;

function renderAttemptsToSuccessChart(progressData) {
  const container = document.getElementById('attempts-success-chart');
  container.innerHTML = '';

  if (!progressData || progressData.length === 0) {
    container.innerHTML = '<p class="text-gray-500">No progress data available.</p>';
    return;
  }

  const groupedBySegment = progressData.reduce((acc, entry) => {
    if (!entry.path) return acc;
    const parts = entry.path.split('/').filter(Boolean);
    const segment = parts[parts.length - 1];
    if (!acc[segment]) acc[segment] = [];
    acc[segment].push(entry);
    return acc;
  }, {});

  const attemptsToSuccess = {};
  for (const [segment, attempts] of Object.entries(groupedBySegment)) {
    attempts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const indexSuccess = attempts.findIndex(a => a.grade === 1);
    attemptsToSuccess[segment] = indexSuccess === -1 ? attempts.length : indexSuccess + 1;
  }

  const segmentsAll = Object.keys(attemptsToSuccess).sort();
  if (segmentsAll.length === 0) {
    container.innerHTML = '<p class="text-gray-500">No valid progress data available.</p>';
    return;
  }

  const start = attemptsPage * attemptsPerPage;
  const end = start + attemptsPerPage;
  const segments = segmentsAll.slice(start, end);

  const maxAttempts = Math.max(...Object.values(attemptsToSuccess));
  const chartWidth = Math.max(600, segments.length * 50);

  const scaleX = (i) => 50 + (i * (chartWidth - 100)) / (segments.length - 1 || 1);
  const scaleY = (val) => CHART_HEIGHT - BOTTOM_PADDING - (val / maxAttempts) * (CHART_HEIGHT - TOP_PADDING - BOTTOM_PADDING);

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', CHART_HEIGHT);
  svg.setAttribute('viewBox', `0 0 ${chartWidth} ${CHART_HEIGHT}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Axes
  const yAxis = document.createElementNS(svgNS, 'line');
  yAxis.setAttribute('x1', 50);
  yAxis.setAttribute('y1', TOP_PADDING);
  yAxis.setAttribute('x2', 50);
  yAxis.setAttribute('y2', CHART_HEIGHT - BOTTOM_PADDING);
  yAxis.setAttribute('stroke', '#000');
  svg.appendChild(yAxis);

  const xAxis = document.createElementNS(svgNS, 'line');
  xAxis.setAttribute('x1', 50);
  xAxis.setAttribute('y1', CHART_HEIGHT - BOTTOM_PADDING);
  xAxis.setAttribute('x2', chartWidth - 50);
  xAxis.setAttribute('y2', CHART_HEIGHT - BOTTOM_PADDING);
  xAxis.setAttribute('stroke', '#000');
  svg.appendChild(xAxis);

  const points = segments.map((segment, i) => {
    const x = scaleX(i);
    const y = scaleY(attemptsToSuccess[segment]);
    return { x, y, segment, attempts: attemptsToSuccess[segment] };
  });

  const linePath = document.createElementNS(svgNS, 'path');
  const d = points.map(({ x, y }, i) => (i === 0 ? `M${x} ${y}` : `L${x} ${y}`)).join(' ');
  linePath.setAttribute('d', d);
  linePath.setAttribute('stroke', '#3B82F6');
  linePath.setAttribute('stroke-width', '2');
  linePath.setAttribute('fill', 'none');
  svg.appendChild(linePath);

  points.forEach(({ x, y, segment, attempts }) => {
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', 6);
    circle.setAttribute('fill', '#3B82F6');
    circle.setAttribute('cursor', 'pointer');

    const title = document.createElementNS(svgNS, 'title');
    title.textContent = `${segment}: ${attempts} attempt${attempts > 1 ? 's' : ''}`;
    circle.appendChild(title);

    svg.appendChild(circle);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', CHART_HEIGHT - 10);
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('dominant-baseline', 'hanging');
    label.setAttribute('font-size', '16');
    label.setAttribute('fill', '#f3f4f6');
    label.setAttribute('transform', `rotate(-90 ${x} ${CHART_HEIGHT - 10})`);
    label.textContent = segment;
    svg.appendChild(label);
  });

  for (let i = 0; i <= maxAttempts; i += Math.ceil(maxAttempts / 5) || 1) {
    const y = scaleY(i);
    const text = document.createElementNS(svgNS, 'text');
    text.setAttribute('x', 45);
    text.setAttribute('y', y + 4);
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('font-size', '16');
    text.setAttribute('fill', '#f3f4f6');
    text.textContent = i;
    svg.appendChild(text);

    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', 50);
    line.setAttribute('y1', y);
    line.setAttribute('x2', chartWidth - 50);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', '#e5e7eb');
    line.setAttribute('stroke-dasharray', '2,2');
    svg.appendChild(line);
  }

  container.appendChild(svg);

  const controls = document.createElement('div');
  controls.className = 'flex justify-center gap-4 mt-20';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '< Prev';
  prevBtn.disabled = attemptsPage === 0;
  prevBtn.className = 'px-3 py-1 bg-gray-700 text-gray-200 rounded hover:bg-blue-600 disabled:opacity-50';
  prevBtn.onclick = () => {
    attemptsPage--;
    renderAttemptsToSuccessChart(progressData);
  };

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next >';
  nextBtn.disabled = end >= segmentsAll.length;
  nextBtn.className = 'px-3 py-1 bg-gray-700 text-gray-200 rounded hover:bg-blue-600 disabled:opacity-50';
  nextBtn.onclick = () => {
    attemptsPage++;
    renderAttemptsToSuccessChart(progressData);
  };

  controls.appendChild(prevBtn);
  controls.appendChild(nextBtn);
  container.appendChild(controls);
}

let currentPage = 0;
const barsPerPage = 10;

function renderXpChart(xpData) {
  const chartContainer = document.querySelector("#xp-chart");
  chartContainer.innerHTML = "";

  if (!xpData || xpData.length === 0) {
    chartContainer.innerHTML = '<p class="text-gray-500">No XP data available.</p>';
    return;
  }

  const xpByPath = {};
  xpData.forEach(({ path, amount }) => {
    const key = path || "Unknown";
    xpByPath[key] = (xpByPath[key] || 0) + parseFloat(amount);
  });

  const labels = Object.keys(xpByPath);
  const values = Object.values(xpByPath);
  const maxValue = Math.max(...values);

  const start = currentPage * barsPerPage;
  const end = start + barsPerPage;
  const pageLabels = labels.slice(start, end);
  const pageValues = values.slice(start, end);

  const chartWidth = barsPerPage * 60 + 50;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", CHART_HEIGHT);
  svg.setAttribute("viewBox", `0 0 ${chartWidth} ${CHART_HEIGHT}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  pageLabels.forEach((label, i) => {
    const value = pageValues[i];
    const barHeight = (value / maxValue) * (CHART_HEIGHT - TOP_PADDING - BOTTOM_PADDING);
    const x = i * 60 + 30;
    const y = CHART_HEIGHT - BOTTOM_PADDING - barHeight;

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", 40);
    rect.setAttribute("height", barHeight);
    rect.setAttribute("fill", "#3B82F6");
    rect.setAttribute("rx", 4);

    const title = document.createElementNS(svgNS, "title");
    title.textContent = `${label}: ${formatXP(value)}`;
    rect.appendChild(title);

    svg.appendChild(rect);

    const valueText = document.createElementNS(svgNS, "text");
    valueText.setAttribute("x", x + 20);
    valueText.setAttribute("y", y - 5);
    valueText.setAttribute("text-anchor", "middle");
    valueText.setAttribute("font-size", "16");
    valueText.setAttribute("fill", "#f3f4f6");
    valueText.textContent = formatXP(value);
    svg.appendChild(valueText);

    const labelText = document.createElementNS(svgNS, "text");
    const labelX = x + 20;
    const labelY = CHART_HEIGHT - 10;
    labelText.setAttribute("x", labelX);
    labelText.setAttribute("y", labelY);
    labelText.setAttribute("text-anchor", "end");
    labelText.setAttribute("dominant-baseline", "hanging");
    labelText.setAttribute("font-size", "16");
    labelText.setAttribute("fill", "#f3f4f6");
    labelText.setAttribute("transform", `rotate(-90 ${labelX} ${labelY})`);
    labelText.textContent = label.split("/").pop();
    svg.appendChild(labelText);
  });

  chartContainer.appendChild(svg);

  const controls = document.createElement("div");
  controls.className = "flex justify-center gap-4 mt-20";

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "< Prev";
  prevBtn.disabled = currentPage === 0;
  prevBtn.className = 'px-3 py-1 bg-gray-700 text-gray-200 rounded hover:bg-blue-600 disabled:opacity-50';
  prevBtn.onclick = () => {
    currentPage--;
    renderXpChart(xpData);
  };

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next >";
  nextBtn.disabled = end >= labels.length;
  nextBtn.className = 'px-3 py-1 bg-gray-700 text-gray-200 rounded hover:bg-blue-600 disabled:opacity-50';
  nextBtn.onclick = () => {
    currentPage++;
    renderXpChart(xpData);
  };

  controls.appendChild(prevBtn);
  controls.appendChild(nextBtn);
  chartContainer.appendChild(controls);
}

function displayUserData(data, selectedGroup = 'bh-module') {
  const div = document.getElementById('user-info');
  const user = data.user_by_pk;

  if (!user) {
    div.innerHTML = '<p class="text-red-500">User info not found.</p>';
    return;
  }

  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  const login = user.login ? `@${user.login}` : '';
  const email = user.email || '';
  const received = formatXP(user.totalDown) || '';
  const done = formatXP(user.totalUp) || '';
  const bonus = formatXP(user.totalUpBonus) || '';

  const filteredXp = filterXpByGroup(data.xp_view, selectedGroup);
  const totalXP = filteredXp.reduce((sum, xp) => sum + parseFloat(xp.amount || 0), 0);

  const upRaw = Number(user.totalUp) || 0;
  const downRaw = Number(user.totalDown) || 0;
  const maxBar = Math.max(upRaw, downRaw, 1);

  const donePct = (upRaw / maxBar) * 100;
  const receivedPct = (downRaw / maxBar) * 100;

  const auditRatioText = downRaw > 0 ? (Math.round((upRaw / downRaw) * 10) / 10) : '∞';

  let ratioValue = downRaw > 0 ? upRaw / downRaw : Infinity;
  let ratioMessage = '';
  let ratioClass = '';

  if (ratioValue === Infinity || ratioValue >= 2.0) {
    ratioMessage = 'Excellent! You nailed it!';
    ratioClass = 'text-green-600';
  } else if (ratioValue >= 1.5) {
    ratioMessage = 'Great! You’re on the right track!';
    ratioClass = 'text-green-600';
  } else if (ratioValue >= 1.0) {
    ratioMessage = 'Hmm… not bad, but you can do better!';
    ratioClass = 'text-amber-600';
  } else {
    ratioMessage = 'Oops! You’ve got room to improve!';
    ratioClass = 'text-red-600';
  }

div.innerHTML = `
<div class="flex flex-col md:flex-row gap-4 w-full">
  <!-- Left column: Card 1 + Card 2 stacked -->
  <div class="flex flex-col gap-4 md:flex-1 md:basis-1/3">

    <!-- Card 1: User Info -->
    <div class="user-card bg-gray-800 p-4 rounded shadow text-gray-200">
      <h3 class="text-xl font-bold mb-4">User Info</h3>
      <ul class="space-y-2">
        ${fullName ? `
          <li class="flex items-center gap-3 p-2 rounded hover:bg-gray-700 transition">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A9 9 0 1118.88 6.196a9 9 0 01-13.758 11.608z"/>
            </svg>
            <span class="font-semibold">Full Name:</span>
            <span class="ml-auto text-gray-200">${fullName}</span>
          </li>` : ''}

        ${login ? `
          <li class="flex items-center gap-3 p-2 rounded hover:bg-gray-700 transition">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 10-8 0 4 4 0 008 0zM12 14c-4.418 0-8 1.79-8 4v1h16v-1c0-2.21-3.582-4-8-4z"/>
            </svg>
            <span class="font-semibold">Username:</span>
            <span class="ml-auto text-gray-200">${login}</span>
          </li>` : ''}

        ${email ? `
          <li class="flex items-center gap-3 p-2 rounded hover:bg-gray-700 transition">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12h2a2 2 0 012 2v6H4v-6a2 2 0 012-2h2m4-8v8m-4-4h8"/>
            </svg>
            <span class="font-semibold">Email:</span>
            <span class="ml-auto text-gray-200">${email}</span>
          </li>` : ''}
      </ul>
    </div>

    <!-- Card 2: Audits Ratio -->
    <div class="audit-card bg-gray-800 p-4 rounded shadow flex-1 text-gray-200">
      <h3 class="text-xl font-bold mb-4">Audits Ratio</h3>
      <div class="flex justify-between text-sm">
        <span>Done</span>
        <span>${done}</span>
      </div>
      <div class="w-full h-2 bg-gray-700 rounded overflow-hidden my-2" role="progressbar" aria-valuenow="${upRaw}" aria-valuemin="0" aria-valuemax="${maxBar}">
        <div class="h-2 bg-green-500" style="width:${donePct}%;"></div>
      </div>
      ${bonus ? `<div class="flex justify-end text-xs text-gray-400 mt-1">+ ${bonus}</div>` : ''}
      <div class="flex justify-between text-sm mt-3">
        <span>Received</span>
        <span>${received}</span>
      </div>
      <div class="w-full h-2 bg-gray-700 rounded overflow-hidden my-2" role="progressbar" aria-valuenow="${downRaw}" aria-valuemin="0" aria-valuemax="${maxBar}">
        <div class="h-2 bg-red-400" style="width:${receivedPct}%;"></div>
      </div>
      <div class="text-center mt-4">
        <p class="text-5xl font-bold ${ratioClass}">${auditRatioText}</p>
        <p class="text-xl ${ratioClass}">${ratioMessage}</p>
      </div>
    </div>
  </div>

  <!-- Card 3: XP -->
  <div class="user-card bg-gray-800 p-4 rounded shadow flex flex-col gap-4 text-gray-200 md:flex-1 md:basis-1/3">
    <h3 class="text-xl font-bold mb-4">XP Overview</h3>
    <div id="xp-group-buttons" class="flex w-full mb-2">
      <button data-group="bh-module" class="xp-btn flex-1 px-4 py-2 font-bold rounded-l border border-gray-600 truncate bg-gray-700 text-gray-200 hover:bg-blue-600">BH Module</button>
      <button data-group="piscine-js" class="xp-btn flex-1 px-4 py-2 font-bold border-t border-b border-gray-600 truncate bg-gray-700 text-gray-200 hover:bg-blue-600">Piscine JS</button>
      <button data-group="bh-piscine" class="xp-btn flex-1 px-4 py-2 font-bold rounded-r border border-gray-600 truncate bg-gray-700 text-gray-200 hover:bg-blue-600">BH Piscine</button>
    </div>
    <div class="text-right text-4xl font-bold mt-2 text-gray-100">
      Total XP: ${formatXP(totalXP)}
    </div>
    <div id="xp-chart" class="w-full flex-1"></div>
  </div>

  <!-- Card 4: Attempts to Success -->
  <div class="user-card bg-gray-800 p-4 rounded shadow flex flex-col gap-4 text-gray-200 md:flex-1 md:basis-1/3">
    <h3 class="text-xl font-bold mb-4">Attempts to Success</h3>
    <div id="attempts-success-chart" class="w-full flex-1"></div>
  </div>
</div>
`;

  renderXpChart(filteredXp);
  renderAttemptsToSuccessChart(data.progress);

setupXpButtons(selectedGroup);

}

function setupXpButtons(selectedGroup) {
  const buttons = document.querySelectorAll("#xp-group-buttons .xp-btn");
  buttons.forEach(btn => {
    if (btn.dataset.group === selectedGroup) {
      btn.classList.add("bg-blue-500", "text-white", "border-blue-500");
      btn.classList.remove("bg-white", "text-black", "border-gray-300");
    } else {
      btn.classList.add("bg-white", "text-black", "border-gray-300");
      btn.classList.remove("bg-blue-500", "text-white", "border-blue-500");
    }
    btn.onclick = () => {
      if (cachedUserData) {
        displayUserData(cachedUserData, btn.dataset.group);
      }
    };
  });
}

function logout() {
  localStorage.removeItem('jwt_token');
  localStorage.removeItem('user_id');
  window.location.href = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
}

let cachedUserData = null;

async function init() {
  const token = localStorage.getItem('jwt_token');
  if (!token) {
    document.getElementById('user-info').innerHTML = '<p class="text-red-500">No login data found. Redirecting...</p>';
    setTimeout(() => window.location.href = 'index.html', 2000);
    return;
  }

  const payload = parseJwt(token);
  if (!payload || !payload.sub) {
    document.getElementById('user-info').innerHTML = '<p class="text-red-500">Invalid token. Please login again.</p>';
    return;
  }

  const userId = parseInt(payload.sub, 10);

  try {
    cachedUserData = await fetchUserData(token, userId);
    displayUserData(cachedUserData);
  } catch (err) {
    document.getElementById('user-info').innerHTML = `<p class="text-red-500">Error: ${err.message}</p>`;
  }
}

document.getElementById('user-info').addEventListener('change', (e) => {
  if (e.target.id === 'xp-group-select') {
    const selectedGroup = e.target.value;
    if (cachedUserData) {
      displayUserData(cachedUserData, selectedGroup);
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn.addEventListener('click', logout);
});

init();
