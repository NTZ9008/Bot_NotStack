# Graph Report - .  (2026-06-16)

## Corpus Check
- Corpus is ~5,723 words - fits in a single context window. You may not need a graph.

## Summary
- 113 nodes · 105 edges · 21 communities (9 shown, 12 thin omitted)
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Event Handlers|Core Event Handlers]]
- [[_COMMUNITY_Level & Weather Commands|Level & Weather Commands]]
- [[_COMMUNITY_Package config|Package config]]
- [[_COMMUNITY_AddRole Command|AddRole Command]]
- [[_COMMUNITY_Command Deployment|Command Deployment]]
- [[_COMMUNITY_Dependencies|Dependencies]]
- [[_COMMUNITY_InteractionCreate Event|InteractionCreate Event]]
- [[_COMMUNITY_BotInfo Command|BotInfo Command]]
- [[_COMMUNITY_Verify Command|Verify Command]]
- [[_COMMUNITY_AdminInfo Command|AdminInfo Command]]
- [[_COMMUNITY_HelpMe Command|HelpMe Command]]
- [[_COMMUNITY_Ping Command|Ping Command]]
- [[_COMMUNITY_Poll Command|Poll Command]]
- [[_COMMUNITY_Random Command|Random Command]]
- [[_COMMUNITY_ServerInfo Command|ServerInfo Command]]
- [[_COMMUNITY_UserInfo Command|UserInfo Command]]
- [[_COMMUNITY_Channel Monitors|Channel Monitors]]
- [[_COMMUNITY_Voice State Monitors|Voice State Monitors]]
- [[_COMMUNITY_GuildMemberAdd Event|GuildMemberAdd Event]]
- [[_COMMUNITY_GuildMemberRemove Event|GuildMemberRemove Event]]
- [[_COMMUNITY_Bot Documentation|Bot Documentation]]

## God Nodes (most connected - your core abstractions)
1. `messageCreate Event` - 8 edges
2. `getWeatherEmbed()` - 5 edges
3. `levelsData` - 5 edges
4. `Level to Token System` - 4 edges
5. `logSpecialRole()` - 2 edges
6. `componentHandler()` - 2 edges
7. `execute()` - 2 edges
8. `fetch()` - 2 edges
9. `execute()` - 2 edges
10. `execute()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `AI Chat System` --conceptually_related_to--> `messageCreate Event`  [INFERRED]
  README.md → index.js
- `Anti-Spam System` --conceptually_related_to--> `messageCreate Event`  [INFERRED]
  README.md → index.js
- `execute()` --semantically_similar_to--> `InteractionCreate Event`  [INFERRED] [semantically similar]
  events/interactionCreate.js → index.js
- `Level to Token System` --conceptually_related_to--> `levelsData`  [INFERRED]
  SOLUTION.md → index.js
- `Bitrate Monitor` --conceptually_related_to--> `channelUpdate Event`  [INFERRED]
  README.md → index.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Slash Command Implementations** — commands_weather_execute, commands_addrole_execute, commands_verify_execute, commands_poll_execute, commands_random_execute, commands_rank_execute, commands_botinfo_execute, commands_serverinfo_execute, commands_userinfo_execute, commands_admininfo_execute, commands_ping_execute, commands_helpme_execute [EXTRACTED 0.95]
- **Component Handlers** — commands_addrole_componenthandler, commands_verify_componenthandler [EXTRACTED 0.95]
- **Interaction Handlers** — index_interactioncreate, events_interactioncreate_execute [INFERRED 0.85]

## Communities (21 total, 12 thin omitted)

### Community 0 - "Core Event Handlers"
Cohesion: 0.11
Nodes (20): aiUsage, badWordsFile, badWordsSet, client, { Client, GatewayIntentBits, Events, Collection, ChannelType, AuditLogEvent }, commandFiles, dotenv, fs (+12 more)

### Community 1 - "Level & Weather Commands"
Cohesion: 0.15
Nodes (13): execute(), fs, path, { SlashCommandBuilder, EmbedBuilder }, execute(), fetch(), getWeatherEmbed(), ClientReady Event (+5 more)

### Community 2 - "Package config"
Cohesion: 0.18
Nodes (10): author, description, keywords, license, main, name, scripts, test (+2 more)

### Community 3 - "AddRole Command"
Cohesion: 0.25
Nodes (7): componentHandler(), fs, logDir, logSpecialRole(), path, {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
}, specialRoles

### Community 4 - "Command Deployment"
Cohesion: 0.25
Nodes (7): { clientId, guildId }, commandFiles, commands, dotenv, fs, rest, { REST, Routes }

### Community 5 - "Dependencies"
Cohesion: 0.33
Nodes (6): dependencies, discord.js, dotenv, @google/generative-ai, node-fetch, node-schedule

### Community 6 - "InteractionCreate Event"
Cohesion: 0.40
Nodes (4): execute(), fs, path, InteractionCreate Event

### Community 16 - "Channel Monitors"
Cohesion: 0.67
Nodes (3): channelUpdate Event, Bitrate Monitor, Region Monitor

### Community 17 - "Voice State Monitors"
Cohesion: 0.67
Nodes (3): voiceSpamMap, voiceStateUpdate Event, Anti-Force Move System

## Knowledge Gaps
- **62 isolated node(s):** `fs`, `path`, `{
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
}`, `specialRoles`, `logDir` (+57 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `levelsData` connect `Level & Weather Commands` to `Core Event Handlers`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `messageCreate Event` (e.g. with `aiUsage` and `badWordsSet`) actually correct?**
  _`messageCreate Event` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `levelsData` (e.g. with `execute()` and `ClientReady Event`) actually correct?**
  _`levelsData` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `Level to Token System` (e.g. with `Bot API Solution` and `Database Migration Solution`) actually correct?**
  _`Level to Token System` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `fs`, `path`, `{
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
}` to the rest of the system?**
  _65 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Event Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.11428571428571428 - nodes in this community are weakly interconnected._