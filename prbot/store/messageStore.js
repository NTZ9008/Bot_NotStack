// เก็บ PR → message id ในตาราง pr_messages (PostgreSQL ตัวเดียวกับบอทหลัก ผ่าน Prisma)
const { prisma } = require('../../db');

async function saveMessage(repoFullName, prNumber, channelId, messageId) {
    await prisma.prMessage.upsert({
        where: { repoFullName_prNumber: { repoFullName, prNumber } },
        create: { repoFullName, prNumber, channelId, messageId },
        update: { channelId, messageId },
    });
}

function getMessage(repoFullName, prNumber) {
    return prisma.prMessage.findUnique({
        where: { repoFullName_prNumber: { repoFullName, prNumber } },
        select: { channelId: true, messageId: true },
    });
}

module.exports = { saveMessage, getMessage };
