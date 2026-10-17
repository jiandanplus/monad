// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Three-minute, nonpayable territory game. Points have no token or asset value.
contract BlitzCanvas {
    uint256 public constant ROUND_DURATION = 180;
    uint8 public constant DISTRICT_COUNT = 9;

    struct District {
        uint8 owner;
        uint64 since;
        uint64[2] accrued;
        // The fixed array starts a new slot and forces combat counters past it.
        // Noncapture damage cannot invalidate other districts' owner/score reads.
        uint16 defense;
        uint32 actions;
        uint32 entrants;
    }
    struct Player {
        uint8 team;
        uint16 points;
        uint64 nextActionAt;
        uint64 lastAt;
        uint64 creditedTeamYield;
    }
    struct Round {
        uint64 startsAt;
        uint64 endsAt;
        mapping(uint8 => District) districts;
        mapping(address => Player) players;
    }
    uint256 private currentRound;
    mapping(uint256 => Round) private rounds;

    event RoundStarted(uint256 indexed roundId, uint64 startsAt, uint64 endsAt, address indexed starter);
    event SquadDeployed(
        uint256 indexed roundId, uint8 indexed district, address indexed actor,
        uint8 team, uint8 unit, uint8 beforeOwner, uint8 afterOwner,
        uint16 beforeDefense, uint16 afterDefense, uint16 spent, uint16 pointsAfter
    );

    function startRound(uint256 expectedCurrentRoundId) external {
        require(expectedCurrentRoundId == currentRound, "Round changed");
        require(currentRound == 0 || block.timestamp >= rounds[currentRound].endsAt, "Round active");
        currentRound += 1;
        Round storage r = rounds[currentRound];
        r.startsAt = uint64(block.timestamp);
        r.endsAt = uint64(block.timestamp + ROUND_DURATION);
        for (uint8 i; i < DISTRICT_COUNT; ++i) {
            District storage d = r.districts[i];
            d.owner = i == 0 ? 1 : i == 8 ? 2 : 0;
            d.defense = i == 0 || i == 8 ? 60 : 20;
            d.since = r.startsAt;
        }
        emit RoundStarted(currentRound, r.startsAt, r.endsAt, msg.sender);
    }

    function cast(uint256 expectedRoundId, uint8 district, uint8 team, uint8 unit) external {
        require(expectedRoundId == currentRound, "Round changed");
        require(currentRound != 0, "No round");
        Round storage r = rounds[currentRound];
        require(block.timestamp < r.endsAt, "Round ended");
        require(district < DISTRICT_COUNT, "Invalid district");
        require(team == 1 || team == 2, "Invalid team");
        require(unit < 3, "Invalid unit");
        Player storage p = r.players[msg.sender];
        require(p.team == 0 || p.team == team, "Team locked");
        require(block.timestamp >= p.nextActionAt, "Cooldown active");
        require(_canReach(r, team, district), "Unreachable");
        District storage d = r.districts[district];
        uint8 beforeOwner = d.owner;
        uint16 beforeDefense = d.defense;
        require(unit != 2 || beforeOwner == 0 || beforeOwner == team, "Engineer cannot attack enemy");
        require(beforeOwner != team || beforeDefense < 100, "No effect");
        uint64[2] memory scores = _scores(r);
        uint16 available = _points(r, p, scores);
        uint16 cost = unit == 0 ? 20 : unit == 1 ? 50 : 35;
        require(available >= cost, "Insufficient points");
        uint16 power = unit == 0 ? 18 : unit == 1 ? 50 : 35;
        uint16 afterDefense;
        uint8 afterOwner = beforeOwner;
        if (beforeOwner == team) {
            afterDefense = beforeDefense + power;
            if (afterDefense > 100) afterDefense = 100;
        } else if (unit == 2) {
            afterOwner = team;
            afterDefense = 30;
        } else if (power >= beforeDefense) {
            afterOwner = team;
            afterDefense = power - beforeDefense;
            if (afterDefense < 10) afterDefense = 10;
        } else {
            afterDefense = beforeDefense - power;
        }

        // First successful action starts personal income; failed actions never lock a faction.
        if (p.team == 0) d.entrants += 1;
        p.team = team;
        p.points = available - cost;
        p.lastAt = uint64(block.timestamp);
        p.creditedTeamYield = scores[team - 1];
        p.nextActionAt = uint64(block.timestamp + (unit == 0 ? 2 : unit == 1 ? 5 : 3));
        if (afterOwner != beforeOwner) {
            // Settle the outgoing owner's integral before assigning the incoming owner.
            if (beforeOwner != 0) d.accrued[beforeOwner - 1] += (uint64(block.timestamp) - d.since) * _rate(district);
            d.since = uint64(block.timestamp);
            d.owner = afterOwner;
            p.points += 20;
            if (p.points > 200) p.points = 200;
        }
        d.defense = afterDefense;
        d.actions += 1;
        emit SquadDeployed(currentRound, district, msg.sender, team, unit, beforeOwner, afterOwner, beforeDefense, afterDefense, cost, p.points);
    }

    function getSnapshot(address viewer) external view returns (
        uint256 roundId, uint64 startsAt, uint64 endsAt,
        uint8[9] memory owners, uint16[9] memory defense,
        uint32[9] memory actions, uint32[9] memory entrants,
        uint64[2] memory scores, uint16 points, uint16 income,
        uint8 viewerTeam, uint64 nextActionAt, uint64 chainTime
    ) {
        roundId = currentRound;
        Round storage r = rounds[roundId];
        startsAt = r.startsAt;
        endsAt = r.endsAt;
        viewerTeam = r.players[viewer].team;
        nextActionAt = r.players[viewer].nextActionAt;
        chainTime = uint64(block.timestamp);
        for (uint8 i; i < DISTRICT_COUNT; ++i) {
            District storage d = r.districts[i];
            owners[i] = d.owner;
            defense[i] = d.defense;
            actions[i] = d.actions;
            entrants[i] = d.entrants;
            if (viewerTeam != 0 && d.owner == viewerTeam) income += uint16(_rate(i));
        }
        if (viewerTeam != 0 && block.timestamp < endsAt) income += 3;
        else income = 0;
        scores = _scores(r);
        points = _points(r, r.players[viewer], scores);
    }

    function getRoundResult(uint256 roundId) external view returns (uint64 score1, uint64 score2, uint8 winner, bool ended) {
        require(roundId != 0 && roundId <= currentRound, "Unknown round");
        Round storage r = rounds[roundId];
        uint64[2] memory scores = _scores(r);
        score1 = scores[0];
        score2 = scores[1];
        ended = block.timestamp >= r.endsAt;
        if (ended) winner = score1 > score2 ? 1 : score1 < score2 ? 2 : 3;
    }

    function _rate(uint8 district) private pure returns (uint64) {
        return district == 4 ? 3 : district == 2 || district == 6 ? 2 : 1;
    }

    function _scores(Round storage r) private view returns (uint64[2] memory scores) {
        uint64 until = uint64(block.timestamp < r.endsAt ? block.timestamp : r.endsAt);
        for (uint8 i; i < DISTRICT_COUNT; ++i) {
            District storage d = r.districts[i];
            scores[0] += d.accrued[0];
            scores[1] += d.accrued[1];
            if (d.owner != 0) scores[d.owner - 1] += (until - d.since) * _rate(i);
        }
    }

    function _points(Round storage r, Player storage p, uint64[2] memory scores) private view returns (uint16) {
        if (p.team == 0) return 100;
        uint64 until = uint64(block.timestamp < r.endsAt ? block.timestamp : r.endsAt);
        uint64 available = uint64(p.points) + 3 * (until - p.lastAt) + scores[p.team - 1] - p.creditedTeamYield;
        return available > 200 ? 200 : uint16(available);
    }

    function _canReach(Round storage r, uint8 team, uint8 district) private view returns (bool) {
        if (r.districts[district].owner == team) return true;
        bool hasTerritory;
        for (uint8 i; i < DISTRICT_COUNT; ++i) {
            if (r.districts[i].owner != team) continue;
            hasTerritory = true;
            uint8 rowDistance = i / 3 > district / 3 ? i / 3 - district / 3 : district / 3 - i / 3;
            uint8 colDistance = i % 3 > district % 3 ? i % 3 - district % 3 : district % 3 - i % 3;
            if (rowDistance + colDistance == 1) return true;
        }
        return !hasTerritory;
    }
}
