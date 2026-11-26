import { tr, byLang } from './i18n';
export interface PageGuide {
    title: string;
    summary: string;
    steps: readonly string[];
    saving: string;
    tip?: string;
}

// Shared vocabulary for page help, navigation, search and feature shortcuts.
export const PAGE_GUIDES = byLang(
    () =>
        ({
            servers: {
                title: tr('common.allServers'),
                summary: tr('common.pickAServerBeforeSettingUp'),
                steps: [tr('common.connectYourDiscordAccountIfPrompted'), tr('common.pickAServerLabeledCanManage'), tr('common.ifYourServerIsntListedInvite')],
                saving: tr('common.selectingAServerDoesNotChange'),
                tip: tr('common.serverOwnersRoleOwnerSeeAnd'),
            },
            overview: {
                title: tr('common.serverOverview'),
                summary: tr('common.startSettingUpTheBotAnd'),
                steps: [tr('common.startWithBotSettingsToPick'), tr('common.pickAFeatureFromTheShortcuts'), tr('common.pickATimeRangeToSee')],
                saving: tr('common.changingTheTimeRangeAndFilters'),
                tip: tr('common.ifTheChartsAreEmptyTry'),
            },
            plugins: {
                title: tr('common.plugins'),
                summary: tr('common.installAndManageAddOnFeatures'),
                steps: [
                    tr('common.browseThePluginCatalogAndPick'),
                    tr('common.pressInstallOnPluginsThis'),
                    tr('common.installedPluginsAppearInThe'),
                ],
                saving: tr('common.installingOrUninstallingAppliesPer'),
                tip: tr('common.uninstallingHidesTheFeatureAnd'),
            },
            uptime: {
                title: tr('common.uptimeMonitor'),
                summary: tr('common.monitorHttpUrlsAndSendDiscord'),
                steps: [
                    tr('common.addYourWebOrApiEndpoint'),
                    tr('common.pickAnAlertChannelAndCheck'),
                    tr('common.checkLatencyAndUptimeChartsBelow'),
                ],
                saving: tr('common.targetsSaveImmediatelyAndRunOn'),
                tip: tr('common.discordAlertsOnlySendOnStatus'),
            },
            reminders: {
                title: tr('common.scheduledReminders'),
                summary: tr('common.scheduleMessagesAndEmbedsToDiscord'),
                steps: [
                    tr('common.createReminderWithChannelAndMessage'),
                    tr('common.chooseOnceDailyWeeklyOrCron'),
                    tr('common.previewAndTestSendBeforeSaving'),
                ],
                saving: tr('common.remindersSaveImmediatelyAndRunIn'),
                tip: tr('common.onceRemindersDisableAutomaticallyAfterSending'),
            },
            config: {
                title: tr('common.botSettings'),
                summary: tr('common.pickTargetChannelsAndTurnOn'),
                steps: [tr('common.pickTheChannelsTheBotPosts'), tr('common.turnOnOnlyTheChatFeatures'), tr('common.waitForSavedBeforeChangingThe')],
                saving: tr('common.savedAsSoonAsYouPick'),
                tip: tr('common.pickDontSendToStopPosting'),
            },
            news: {
                title: tr('common.announcements'),
                summary: tr('common.writeNewsAndPreviewItBefore'),
                steps: [tr('common.firstPickTheNewsChannelOn'), tr('common.pickANewsTypeFillIn'), tr('common.pressPostAnnouncementToDiscordAnd')],
                saving: tr('common.messagesAreSentForRealAfter'),
                tip: tr('common.colorFooterAndImageAreOptional'),
            },
            welcome: {
                title: tr('common.welcomeNewMembers'),
                summary: tr('common.createWelcomeMessagesAndCardsFor'),
                steps: [tr('common.createOrPickAWelcomeCard'), tr('common.editTheTextAndStyleCheck'), tr('common.enableTheCardAndUseThe')],
                saving: tr('common.cardEditsNeedSaveTheOn'),
                tip: tr('common.testingSendsARealMessageTo'),
            },
            weather: {
                title: tr('common.weatherReport'),
                summary: tr('common.scheduleWeatherReportsWithForecastAnd'),
                steps: [tr('common.setTheChannelAndSendTime'), tr('common.checkThePreviewAndPressSave'), tr('common.fineTuneTheMessageChartOr')],
                saving: tr('common.settingsNeedSaveTheOnOff'),
                tip: tr('common.theTestButtonSendsAReal'),
            },
            roomAccess: {
                title: tr('common.roomAccess'),
                summary: tr('common.grantOrRevokeAccessToSpecial'),
                steps: [tr('common.addTheChannelsYouWantTo'), tr('common.pickTheUserChannelAndAction'), tr('common.setADurationForTemporaryAccess')],
                saving: tr('common.actionButtonsChangeRealDiscordPermissions'),
                tip: tr('common.temporaryAccessIsRevokedAutomaticallyWhen'),
            },
            voiceGuard: {
                title: tr('common.voiceGuard'),
                summary: tr('common.decideWhoMayOrMayNot'),
                steps: [tr('common.pickAllowOnlyWhitelistOrBlock'), tr('common.pickAVoiceChannelAndPress2'), tr('common.checkEachChannelsSwitchAndChoose')],
                saving: tr('common.addingRemovingMembersAndSwitchesApply'),
                tip: tr('common.addedChannelsTakeEffectImmediatelyA'),
            },
            voiceListen: {
                title: tr('common.voiceListen'),
                summary: tr('common.haveTheBotJoinAVoice'),
                steps: [tr('common.pickAVoiceChannelAndPress'), tr('common.pressStartListeningAndAdjustThe'), tr('common.pressMakeTheBotLeaveWhen')],
                saving: tr('common.everyButtonTakesEffectImmediatelyNo'),
                tip: tr('common.theBotNeedsViewChannelAnd'),
            },
            logManager: {
                title: tr('common.eventLogSettings'),
                summary: tr('common.pickEventsAndAlertChannelsAnd'),
                steps: [tr('common.startInTheEventsChannelsTab'), tr('common.turnOnTheWholeLogSystem'), tr('common.adjustTheMessageFormatOrExclude')],
                saving: tr('common.eventsChannelsAndFiltersSaveImmediately'),
                tip: tr('common.postingLogsToDiscordAndStoring'),
            },
            prBot: {
                title: tr('common.githubPrAlerts'),
                summary: tr('common.postPullRequestActivityToA'),
                steps: [
                    tr('common.pickADefaultChannelAndPress'),
                    tr('common.setUpTheGithubWebhookUsing'),
                    tr('common.optionallyRouteOrganizationsToSeparateChannels'),
                ],
                saving: tr('common.eachSectionHasItsOwnSave'),
                tip: tr('common.theSecretVerifiesMessagesFromGithub'),
            },
            grafanaAlerts: {
                title: tr('common.grafanaAlerts'),
                summary: tr('common.receiveAlertmanagerAndPostFiringResolved'),
                steps: [tr('common.pickADefaultAlertChannelOr'), tr('common.copyThePayloadUrlAndSecret'), tr('common.sendATestAlertToCheck')],
                saving: tr('common.theDefaultChannelAndLabelMapping'),
                tip: tr('common.afterCreatingANewSecretUpdate'),
            },
            jira: {
                title: tr('common.jiraCards'),
                summary: tr('common.letMembersOpenJiraCardsFrom'),
                steps: [tr('common.enterTheJiraSiteUrlEmail'), tr('common.tickTheCardTypesToOffer'), tr('common.pressSendPanelToChannelAnd')],
                saving: tr('common.editThenSaveCtrlSThe'),
                tip: tr('common.theApiTokenIsStoredEncrypted'),
            },
            funds: {
                title: tr('common.fundCollection'),
                summary: tr('common.createFundTopicsSetPerPerson'),
                steps: [
                    tr('common.pressCreateTopicAndSetA'),
                    tr('common.addTheMembersWhoNeedTo'),
                    tr('common.whenMoneyArrivesPressReceiveOr'),
                    tr('common.pressSendReportToPostA'),
                ],
                saving: tr('common.creatingEditingTopicsAndRecordingPayments'),
                tip: tr('common.youCanChooseToTagPeople'),
            },
            levels: {
                title: tr('common.ranksLevels'),
                summary: tr('common.seeTheXpLeaderboardAndCustomize'),
                steps: [tr('common.searchForAMemberOrPress'), tr('common.openTheMyCardTabTo'), tr('common.peopleWhoCanManageTheServer')],
                saving: tr('common.eachTabHasItsOwnSave'),
                tip: tr('common.xpIsExperienceEarnedFromActivity'),
            },
            relations: {
                title: tr('common.relationsBoard'),
                summary: tr('common.seeWhichMembersAreConnectedAnd'),
                steps: [tr('common.dragTheBoardToPanUse'), tr('common.clickAPersonToSeeTheir'), tr('common.pickATimeRangeOrFilter')],
                saving: tr('common.viewOnlyDraggedCardPositionsAre'),
                tip: tr('common.peopleWithACrossHaveLeft'),
            },
            audit: {
                title: tr('common.serverHistory'),
                summary: tr('common.seeWhoChangedSettingsAndWhat'),
                steps: [tr('common.pickTheDashboardSettingsTabOr'), tr('common.useTheFiltersToFindWhat'), tr('common.openAnEntrysDetailsToCheck')],
                saving: tr('common.viewOnlyFilteringNeverChangesThe'),
            },
            customSummary: {
                title: tr('common.summaryReport'),
                summary: tr('common.buildVoiceMessageGithubPrAnd'),
                steps: [tr('common.pickATimeRangeInAsia'), tr('common.filterUsersOrToggleIncludeBots'), tr('common.pressExportAsPdfToSet')],
                saving: tr('common.processingAndExportingNeverChangeThe'),
            },
            account: {
                title: tr('common.myAccount'),
                summary: tr('common.manageYourAccountDiscordConnectionAnd'),
                steps: [tr('common.checkYourAccountDetailsAndThe'), tr('common.connectDiscordToAccessYourServers'), tr('common.useTheSecuritySectionToChange')],
                saving: tr('common.eachActionHasItsOwnButton'),
            },
            users: {
                title: tr('common.users'),
                summary: tr('common.manageDashboardAccountsAndAccess'),
                steps: [tr('common.searchForAUserOrFill'), tr('common.checkTheTargetAccountBeforeChanging'), tr('common.readAndConfirmTheActionAs')],
                saving: tr('common.roleAndAccountStatusChangesApply'),
                tip: tr('common.adminManagesEveryServerAndThe'),
            },
            systemAudit: {
                title: tr('common.systemHistory'),
                summary: tr('common.reviewLoginsAndChangesAcrossAll'),
                steps: [tr('common.pickFiltersToNarrowDownThe'), tr('common.checkTheActorTimeAndDetails'), tr('common.useServerHistoryToLookAt')],
                saving: tr('common.viewOnlyFilteringNeverChangesThe'),
            },
            logs: {
                title: tr('common.botLogFiles'),
                summary: tr('common.openLogFilesToCheckWhat'),
                steps: [tr('common.pickALogFileFromThe'), tr('common.readTheEventsAndWhenThey'), tr('common.pressRefreshToLoadTheLatest')],
                saving: tr('common.thisPageOnlyReadsLogFiles'),
            },
        }) satisfies Record<string, PageGuide>,
);

export type PageGuideKey = keyof ReturnType<typeof PAGE_GUIDES>;
