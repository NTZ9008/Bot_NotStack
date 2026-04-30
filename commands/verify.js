const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

const correctPassword = 'notstack123'; // รหัสผ่าน

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('เริ่มกระบวนการยืนยันตัวตนเพื่อเข้าเซิร์ฟเวอร์'), // ไม่ต้องมี Option ย่อยแล้ว

  // 1. ทำงานเมื่อพิมพ์คำสั่ง /verify
  async execute(interaction) {
    // สร้างเมนู Dropdown ให้เลือกรุ่น
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('verify_select_role')
        .setPlaceholder('🔍 คลิกลูกศรเพื่อเลือกรุ่นของคุณ')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('รุ่น DST04')
                .setValue('DST04')
                .setDescription('สำหรับนักศึกษารุ่นที่ 4')
                .setEmoji('🎓'),
            new StringSelectMenuOptionBuilder()
                .setLabel('รุ่น DST05')
                .setValue('DST05')
                .setDescription('สำหรับนักศึกษารุ่นที่ 5')
                .setEmoji('🎓')
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    // ส่งข้อความพร้อม Dropdown (เห็นเฉพาะคนพิมพ์)
    await interaction.reply({ 
        content: '👋 **ยินดีต้อนรับสู่ระบบยืนยันตัวตน!**\nโปรดเลือกรุ่นของคุณจากเมนูด้านล่างนี้ครับ:', 
        components: [row],
        ephemeral: true 
    });
  },

  // 2. ทำงานเมื่อมีการโต้ตอบกับปุ่ม, เมนู, หรือ Pop-up
  async componentHandler(interaction) {
    
    // --- ด่านที่ 1: เมื่อผู้ใช้กดเลือก Dropdown ---
    if (interaction.isStringSelectMenu() && interaction.customId === 'verify_select_role') {
        const selectedRole = interaction.values[0]; // ดึงค่าที่เลือก (DST04 หรือ DST05)

        // สร้าง Pop-up (Modal) ถามรหัสผ่าน และแอบฝังชื่อรุ่นไว้ใน customId
        const modal = new ModalBuilder()
            .setCustomId(`verify_modal_${selectedRole}`)
            .setTitle(`ยืนยันรหัสผ่านสำหรับรุ่น ${selectedRole}`);

        const passwordInput = new TextInputBuilder()
            .setCustomId('password_input')
            .setLabel(`🔑 รหัสผ่านของรุ่น ${selectedRole} คืออะไร?`)
            .setPlaceholder('พิมพ์รหัสผ่านที่นี่...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(passwordInput);
        modal.addComponents(row);

        // เด้ง Pop-up ทับขึ้นมาทันทีที่กดเลือกเมนู
        await interaction.showModal(modal);
        return;
    }

    // --- ด่านที่ 2: เมื่อผู้ใช้พิมพ์รหัสผ่านใน Pop-up แล้วกดส่ง ---
    if (interaction.isModalSubmit() && interaction.customId.startsWith('verify_modal_')) {
        
        // ดึงชื่อรุ่นที่แอบฝังไว้กลับมา
        const roleName = interaction.customId.replace('verify_modal_', '');
        const password = interaction.fields.getTextInputValue('password_input');
        const member = interaction.member;

        // เช็ครหัสผ่าน
        if (password !== correctPassword) {
            return interaction.reply({ content: '❌ **รหัสผ่านไม่ถูกต้อง** กรุณาลองใหม่อีกครั้ง', ephemeral: true });
        }

        // หาระบุ Role ในเซิร์ฟเวอร์
        const role = interaction.guild.roles.cache.find(r => r.name === roleName);
        if (!role) {
            return interaction.reply({ content: `❌ ระบบขัดข้อง: แอดมินยังไม่ได้สร้าง Role ชื่อ **"${roleName}"** ไว้ในเซิร์ฟเวอร์`, ephemeral: true });
        }

        // ป้องกันการขอยศซ้ำ
        if (member.roles.cache.has(role.id)) {
            return interaction.reply({ content: `✅ คุณมียศ **${roleName}** อยู่แล้วครับ ไม่ต้องยืนยันซ้ำ`, ephemeral: true });
        }

        // มอบยศ
        try {
            await member.roles.add(role);
            await interaction.reply({ content: `🎉 **ยืนยันตัวตนสำเร็จ!** คุณได้รับยศ **${roleName}** เรียบร้อยแล้ว ยินดีต้อนรับครับ!`, ephemeral: true });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: '❌ บอทไม่มีสิทธิ์ให้ยศ (โปรดเช็คว่ายศของบอทอยู่สูงกว่ายศที่จะให้ไหม)', ephemeral: true });
        }
    }
  }
};