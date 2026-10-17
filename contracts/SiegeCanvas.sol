// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice A fixed, bounded four-faction game. Funds and score are game counters, never assets.
contract SiegeCanvas {
    struct Node { uint8 owner; uint32 version; uint64 cooldownUntil; bool fortified; uint16[] units; }
    struct Checkpoint { uint64 at; uint256 funds; uint256 score; }
    struct Round {
        uint64 startsAt; uint64 endsAt; uint256 rosterVersion; uint8 seatsPerFaction;
        address[] players; uint8[] teams; Node[13] nodes; Checkpoint[4] points;
    }
    struct NodeView { uint8 owner; uint32 version; uint64 cooldownUntil; bool fortified; uint16[] units; bool supplied; }
    struct Snapshot {
        uint256 roundId; uint64 startsAt; uint64 endsAt; uint64 blockTimestamp;
        uint256 rosterVersion; uint8 seatsPerFaction; address[] players; uint8[] teams;
        NodeView[13] nodes; uint256[4] funds; uint256[4] scores; uint8[4] incomeRates; uint8[4] scoreRates;
    }
    struct Army { uint16[12] units; uint8 count; }
    address private lobbyHost;
    uint256 private lobbyVersion;
    uint256 private currentRoundId;
    uint8 private lobbySeats = 2;
    address[] private lobbyPlayers;
    uint8[] private lobbyTeams;
    bool[] private lobbyReady;
    mapping(uint256 => Round) private rounds;

    event RosterConfigured(uint256 indexed rosterVersion, uint8 seatsPerFaction);
    event PlayerReady(uint256 indexed rosterVersion, address indexed actor);
    event RoundStarted(uint256 indexed roundId, uint64 startsAt, uint64 endsAt);
    event OrderExecuted(uint256 indexed roundId, address indexed actor, uint8 indexed action,
        uint8 from, uint8 to, uint8 team, uint32 fromVersion, uint32 toVersion, uint16 spent,
        bool captured, bool returned, uint16[] deployed, uint16[] survivors);

    constructor() { lobbyHost = msg.sender; }

    function configureRoster(uint256 expectedRosterVersion, address[] calldata players, uint8[] calldata teams, uint8 seatsPerFaction) external {
        require(msg.sender == lobbyHost, "Host only");
        require(!_active(), "Round active");
        require(expectedRosterVersion == lobbyVersion, "Roster changed");
        require(seatsPerFaction >= 1 && seatsPerFaction <= 4 && players.length == uint256(seatsPerFaction) * 4 && teams.length == players.length, "Invalid roster size");
        uint8[4] memory counts;
        for (uint256 i; i < players.length; i++) {
            require(players[i] != address(0) && teams[i] >= 1 && teams[i] <= 4, "Invalid seat");
            for (uint256 j; j < i; j++) require(players[j] != players[i], "Duplicate player");
            counts[teams[i]-1]++;
        }
        for (uint256 i; i < 4; i++) require(counts[i] == seatsPerFaction, "Unbalanced roster");
        lobbyPlayers = players; lobbyTeams = teams; lobbySeats = seatsPerFaction;
        delete lobbyReady;
        for (uint256 i; i < players.length; i++) lobbyReady.push(false);
        lobbyVersion++;
        emit RosterConfigured(lobbyVersion, seatsPerFaction);
    }

    function ready(uint256 expectedRosterVersion) external {
        require(expectedRosterVersion == lobbyVersion, "Roster changed");
        for (uint256 i; i < lobbyPlayers.length; i++) if (lobbyPlayers[i] == msg.sender) {
            lobbyReady[i] = true;
            emit PlayerReady(lobbyVersion, msg.sender);
            return;
        }
        revert("Not in roster");
    }

    function startRound(uint256 expectedRoundId, uint256 expectedRosterVersion) external {
        require(msg.sender == lobbyHost, "Host only");
        require(expectedRoundId == currentRoundId && expectedRosterVersion == lobbyVersion, "Version changed");
        require(!_active(), "Round active");
        require(lobbyPlayers.length == uint256(lobbySeats) * 4, "Roster incomplete");
        for (uint256 i; i < lobbyPlayers.length; i++) { require(lobbyReady[i], "Not all ready"); lobbyReady[i] = false; }
        currentRoundId++;
        Round storage r = rounds[currentRoundId];
        r.startsAt = uint64(block.timestamp); r.endsAt = r.startsAt + 300;
        r.rosterVersion = lobbyVersion; r.seatsPerFaction = lobbySeats; r.players = lobbyPlayers; r.teams = lobbyTeams;
        for (uint8 i; i < 13; i++) {
            Node storage n = r.nodes[i];
            if (i < 4) { n.owner = i == 0 ? 1 : i == 1 ? 3 : i == 2 ? 2 : 4; n.units.push(10); n.units.push(10); n.units.push(10); n.units.push(286); n.units.push(520); }
            else { n.units.push(10); n.units.push(10); }
        }
        for (uint8 i; i < 4; i++) r.points[i] = Checkpoint(r.startsAt, 100, 0);
        emit RoundStarted(currentRoundId, r.startsAt, r.endsAt);
    }

    function getLobby() external view returns (address host, uint256 rosterVersion, uint8 seatsPerFaction, address[] memory players, uint8[] memory teams, bool[] memory readyFlags) {
        return (lobbyHost, lobbyVersion, lobbySeats, lobbyPlayers, lobbyTeams, lobbyReady);
    }

    function getSnapshot(uint256 requestedRoundId) external view returns (Snapshot memory s) {
        uint256 id = requestedRoundId == 0 ? currentRoundId : requestedRoundId;
        require(id <= currentRoundId, "Unknown round");
        s.roundId = id; s.blockTimestamp = uint64(block.timestamp);
        if (id == 0) { s.rosterVersion = lobbyVersion; s.seatsPerFaction = lobbySeats; s.players = lobbyPlayers; s.teams = lobbyTeams; return s; }
        Round storage r = rounds[id];
        s.startsAt = r.startsAt; s.endsAt = r.endsAt; s.rosterVersion = r.rosterVersion;
        s.seatsPerFaction = r.seatsPerFaction; s.players = r.players; s.teams = r.teams;
        uint16[4] memory connected;
        for (uint8 t = 1; t <= 4; t++) {
            (uint8 income, uint8 score, uint16 mask) = _rates(r, t); connected[t-1] = mask;
            (s.funds[t-1], s.scores[t-1]) = _balance(r, t, income, score);
            s.incomeRates[t-1] = income; s.scoreRates[t-1] = score;
        }
        for (uint8 i; i < 13; i++) {
            Node storage n = r.nodes[i];
            s.nodes[i] = NodeView(n.owner, n.version, n.cooldownUntil, n.fortified, n.units,
                n.owner > 0 && (connected[n.owner-1] & (uint16(1) << i)) != 0);
        }
    }

    function recruit(uint256 expectedRoundId, uint8 node, uint32 nodeVersion, uint8 kind, uint8 count) external {
        uint8 team = _authorize(expectedRoundId, node, nodeVersion);
        Round storage r = rounds[currentRoundId]; Node storage n = r.nodes[node];
        require((node < 4 || node == 12) && (node != 12 || kind != 1), "Invalid production point");
        require(kind <= 2 && count >= 1 && count <= 6 && n.units.length + count <= 12, "Invalid recruitment");
        _requireSupply(r, team, node);
        uint16 cost = uint16(count) * (kind == 0 ? 20 : kind == 1 ? 50 : 35);
        _spend(r, team, cost);
        uint16[] memory deployed = new uint16[](count);
        for (uint8 i; i < count; i++) { deployed[i] = (uint16(kind) << 8) | _maxHP(kind); n.units.push(deployed[i]); }
        _bump(n);
        emit OrderExecuted(currentRoundId, msg.sender, 0, node, node, team, n.version, n.version, cost, false, false, deployed, new uint16[](0));
    }

    function fortify(uint256 expectedRoundId, uint8 node, uint32 nodeVersion) external {
        uint8 team = _authorize(expectedRoundId, node, nodeVersion);
        Round storage r = rounds[currentRoundId]; Node storage n = r.nodes[node];
        _requireSupply(r, team, node); _requireEngineer(n);
        require(node >= 4 && !n.fortified, "Invalid fortification");
        _spend(r, team, 20); n.fortified = true; _bump(n);
        emit OrderExecuted(currentRoundId, msg.sender, 2, node, node, team, n.version, n.version, 20, false, false, new uint16[](0), new uint16[](0));
    }

    function repair(uint256 expectedRoundId, uint8 node, uint32 nodeVersion, uint8[] calldata unitIndexes) external {
        uint8 team = _authorize(expectedRoundId, node, nodeVersion);
        Round storage r = rounds[currentRoundId]; Node storage n = r.nodes[node];
        _requireSupply(r, team, node); _requireEngineer(n); _selection(n, unitIndexes, 3);
        for (uint256 i; i < unitIndexes.length; i++) {
            uint16 unit = n.units[unitIndexes[i]]; uint8 kind = uint8(unit >> 8); uint16 hp = unit & 255;
            require(hp < _maxHP(kind), "Unit is full health");
            hp += 10; if (hp > _maxHP(kind)) hp = _maxHP(kind);
            n.units[unitIndexes[i]] = (uint16(kind) << 8) | hp;
        }
        _spend(r, team, 15); _bump(n);
        emit OrderExecuted(currentRoundId, msg.sender, 3, node, node, team, n.version, n.version, 15, false, false, new uint16[](0), new uint16[](0));
    }

    function dispatch(uint256 expectedRoundId, uint8 from, uint8 to, uint32 fromVersion, uint32 toVersion, uint8[] calldata unitIndexes) external {
        uint8 team = _authorize(expectedRoundId, from, fromVersion);
        Round storage r = rounds[currentRoundId]; Node storage source = r.nodes[from];
        require(to < 13 && (_neighbors(from) & (uint16(1) << to)) != 0, "Not adjacent");
        Node storage target = r.nodes[to];
        require(target.version == toVersion, "Target changed");
        require(to >= 4 || target.owner == team, "Enemy base");
        _selection(source, unitIndexes, 6);
        Army memory attackers; Army memory remaining;
        uint256 cursor;
        for (uint256 i; i < source.units.length; i++) {
            if (cursor < unitIndexes.length && i == unitIndexes[cursor]) { attackers.units[attackers.count++] = source.units[i]; cursor++; }
            else remaining.units[remaining.count++] = source.units[i];
        }
        uint16[] memory deployed = _array(attackers);
        bool captured; bool returned;
        if (target.owner == team) {
            require(target.units.length + attackers.count <= 12, "Friendly capacity");
            for (uint8 i; i < attackers.count; i++) target.units.push(attackers.units[i]);
        } else {
            require(target.units.length == 0 || _combatUnit(attackers), "Engineers cannot attack");
            Army memory defenders = _army(target.units);
            _battle(attackers, defenders, to >= 8 && to <= 11, target.fortified);
            target.fortified = false;
            captured = defenders.count == 0 && _occupier(attackers);
            if (captured) {
                // Old supply rates must be settled before changing any flag.
                for (uint8 t = 1; t <= 4; t++) _settle(r, t);
                target.owner = team; target.units = _array(attackers);
            } else {
                target.units = _array(defenders); returned = attackers.count > 0;
                for (uint8 i; i < attackers.count; i++) remaining.units[remaining.count++] = attackers.units[i];
            }
        }
        source.units = _array(remaining); _bump(source); target.version++;
        emit OrderExecuted(currentRoundId, msg.sender, 1, from, to, team, source.version, target.version, 0, captured, returned, deployed, _array(attackers));
    }

    function _active() private view returns (bool) { return currentRoundId > 0 && block.timestamp < rounds[currentRoundId].endsAt; }
    function _authorize(uint256 expectedRoundId, uint8 node, uint32 version) private view returns (uint8 team) {
        require(currentRoundId > 0 && expectedRoundId == currentRoundId, "Round changed");
        require(_active(), "Round ended"); require(node < 13, "Invalid node");
        Round storage r = rounds[currentRoundId];
        for (uint256 i; i < r.players.length; i++) if (r.players[i] == msg.sender) { team = r.teams[i]; break; }
        require(team > 0, "Not in roster"); Node storage n = r.nodes[node];
        require(n.owner == team, "Not owned"); require(n.version == version, "Source changed");
        require(block.timestamp >= n.cooldownUntil, "Cooldown active");
    }
    function _bump(Node storage n) private { n.version++; n.cooldownUntil = uint64(block.timestamp) + 3; }
    function _selection(Node storage n, uint8[] calldata indexes, uint8 maximum) private view {
        require(indexes.length >= 1 && indexes.length <= maximum, "Invalid selection");
        for (uint256 i; i < indexes.length; i++) require(indexes[i] < n.units.length && (i == 0 || indexes[i] > indexes[i-1]), "Invalid unit index");
    }
    function _requireEngineer(Node storage n) private view {
        for (uint256 i; i < n.units.length; i++) if (n.units[i] >> 8 == 2) return;
        revert("Engineer required");
    }
    function _requireSupply(Round storage r, uint8 team, uint8 node) private view {
        (,,uint16 mask) = _rates(r, team); require((mask & (uint16(1) << node)) != 0, "No supply");
    }
    function _spend(Round storage r, uint8 team, uint16 amount) private {
        _settle(r, team); Checkpoint storage p = r.points[team-1]; require(p.funds >= amount, "Insufficient funds"); p.funds -= amount;
    }
    function _settle(Round storage r, uint8 team) private {
        (uint8 income, uint8 score,) = _rates(r, team);
        (uint256 funds, uint256 points) = _balance(r, team, income, score);
        r.points[team-1] = Checkpoint(uint64(block.timestamp < r.endsAt ? block.timestamp : r.endsAt), funds, points);
    }
    function _balance(Round storage r, uint8 team, uint8 income, uint8 score) private view returns (uint256 funds, uint256 points) {
        Checkpoint storage p = r.points[team-1]; uint256 at = block.timestamp < r.endsAt ? block.timestamp : r.endsAt;
        uint256 elapsed = at - p.at; funds = p.funds + elapsed * income; if (funds > 200) funds = 200;
        points = p.score + elapsed * score;
    }
    function _rates(Round storage r, uint8 team) private view returns (uint8 income, uint8 score, uint16 connected) {
        uint16 owned;
        for (uint8 i; i < 13; i++) if (r.nodes[i].owner == team) owned |= uint16(1) << i;
        uint8 home = team == 1 ? 0 : team == 2 ? 2 : team == 3 ? 1 : 3;
        connected = (uint16(1) << home) & owned;
        // At most twelve expansions discover every reachable node on this thirteen-node graph.
        for (uint8 pass; pass < 12; pass++) {
            uint16 next = connected;
            for (uint8 i; i < 13; i++) if ((connected & (uint16(1) << i)) != 0) next |= _neighbors(i) & owned;
            if (next == connected) break;
            connected = next;
        }
        income = 1;
        for (uint8 i = 4; i < 12; i++) if ((connected & (uint16(1) << i)) != 0) { if (i < 8) income++; else score++; }
    }
    function _neighbors(uint8 node) private pure returns (uint16) {
        uint16[13] memory edges = [uint16(144),48,96,192,771,1542,3084,2313,4240,4144,4192,4288,3840]; return edges[node];
    }
    function _maxHP(uint8 kind) private pure returns (uint16) { return kind == 0 ? 10 : kind == 1 ? 30 : 8; }
    function _army(uint16[] storage units) private view returns (Army memory a) {
        a.count = uint8(units.length); for (uint8 i; i < a.count; i++) a.units[i] = units[i];
    }
    function _array(Army memory a) private pure returns (uint16[] memory units) {
        units = new uint16[](a.count); for (uint8 i; i < a.count; i++) units[i] = a.units[i];
    }
    function _combatUnit(Army memory a) private pure returns (bool) {
        for (uint8 i; i < a.count; i++) if (a.units[i] >> 8 != 2) return true; return false;
    }
    function _occupier(Army memory a) private pure returns (bool) {
        for (uint8 i; i < a.count; i++) if (a.units[i] >> 8 != 1) return true; return false;
    }
    function _battle(Army memory a, Army memory d, bool city, bool fortified) private pure {
        for (uint8 pulse; pulse < 3 && a.count > 0 && d.count > 0; pulse++) {
            uint16[3] memory toD = _damage(a, d, false); uint16[3] memory toA = _damage(d, a, city);
            if (city) toD[0] = toD[0] * 75 / 100;
            if (fortified) for (uint8 k; k < 3; k++) toD[k] = toD[k] * 80 / 100;
            _applyDamage(a, toA); _applyDamage(d, toD);
        }
    }
    function _damage(Army memory a, Army memory d, bool city) private pure returns (uint16[3] memory hits) {
        bool[3] memory present;
        for (uint8 i; i < d.count; i++) present[d.units[i] >> 8] = true;
        for (uint8 i; i < a.count; i++) {
            uint8 kind = uint8(a.units[i] >> 8); if (kind == 2) continue;
            uint8 target = kind == 0 ? (present[1] ? 1 : present[0] ? 0 : 2) : (present[0] ? 0 : present[1] ? 1 : 2);
            uint16 hit = kind == 0 ? (target == 0 ? 4 : target == 1 ? 7 : 5) : (target == 1 ? 10 : 12);
            if (city && kind == 0 && target == 1) hit *= 2;
            hits[target] += hit;
        }
    }
    function _applyDamage(Army memory a, uint16[3] memory hits) private pure {
        for (uint8 kind; kind < 3; kind++) {
            // Select lowest hp, then lowest original array index; dead entries stay until compaction.
            for (uint8 step; step < a.count && hits[kind] > 0; step++) {
                uint8 chosen = 12; uint16 smallest = 256;
                for (uint8 i; i < a.count; i++) {
                    uint16 hp = a.units[i] & 255;
                    if (a.units[i] >> 8 == kind && hp > 0 && hp < smallest) { chosen = i; smallest = hp; }
                }
                if (chosen == 12) break;
                uint16 loss = hits[kind] < smallest ? hits[kind] : smallest;
                a.units[chosen] -= loss; hits[kind] -= loss;
            }
        }
        uint8 count;
        for (uint8 i; i < a.count; i++) if ((a.units[i] & 255) > 0) a.units[count++] = a.units[i];
        a.count = count;
    }
}
