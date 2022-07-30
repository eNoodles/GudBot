const { Message, TextChannel, Webhook, Collection } = require('discord.js');
const { blacklist, whitelist } = require('../database/dbObjects');
const { ids, prependFakeReply, findLastSpaceIndex, getGuildUploadLimit, logUnless } = require('../utils');
const { addToMessageGroups } = require('./spamManager');

let blacklist_regexp = new RegExp('', 'ig');

/**
 * K: Snowflake representing channel id
 * V: gudbot's webhook for that channel
 * @type {Collection<string,Webhook>}
 */
const webhooks_cache = new Collection();
/**
 * K: Snowflake representing message id
 * V: Snowflake representing original message author's id
 * @type {Collection<string,string>}
 */
const censored_authors_cache = new Collection();

/**
 * Caches message author id by corresponding censored message id. Used for looking up author of censored message in "Delete and jail" command.
 * @param {string} message_id ID of censored message sent by webhook
 * @param {string} author_id ID of author who sent the original uncensored message
 */
 function cacheAuthorId(message_id, author_id) {
    //message id is the key because there will be no way on knowing who the original author was later
    censored_authors_cache.set(message_id, author_id);
    //keep cache under 10000 elements
    if (censored_authors_cache.size > 10000) {
        //get first 100 keys
        const keys = censored_authors_cache.firstKey(100);
        //delete those elements
        keys.forEach(key => censored_authors_cache.delete(key));
    }
}

const confusables = [
    //A
    ['a', '@', 'ɑ', 'α', 'а', '⍺', '𝐚', 'ａ', 'ạ', 'ą', 'ä', 'à', 'á', 'Ꭺ', 'ᗅ', 'ꓮ', '𐊠', '🇦', 'д', '4', '🅰️', '4️⃣', '𝔞', '𝔄', '𝖆', '𝕬', 'ค', '𝓪', '𝓐', '𝒶', '𝒜', '𝕒', '𝔸', 'ᴀ', '🄰', '∀', 'ɐ', 'ɒ', 
    'ₐ', 'ᵃ', 'ᴬ', 'ⓐ', '𝐀', '𝗮', '𝗔', '𝘢', '𝘈', '𝙖', '𝘼', '𝚊', '𝙰', 'ǟ', 'Ꮧ', 'å', '₳', '卂', 'ﾑ', 'Λ', 'Ⱥ', 'ᗩ', 'Ã', 'ά', 'ª', 'â', 'ā', 'ă', 'ǎ', 'ȁ', 'ȃ', 'ȧ', 'ḁ', 'ẚ', 'ấ', 'ầ', 'ẩ', 'ǻ', 'ắ', 
    'ằ', 'ẳ', 'ẵ', 'ǡ', 'ậ', 'ặ', 'ả', '⒜', '𝒂', '𝖺'],
    //B
    ['b', 'Ƅ', 'Ꮟ', 'ᑲ', 'ᖯ', '𝐛', 'Β', 'В', 'Ᏼ', 'ᗷ', 'ℬ', 'ꓐ', 'Ꞵ', '𐊂', 'Ｂ', '🇧', 'ъ', 'ь', 'б', '8', '🅱️', '8️⃣', '𝔟', '𝔅', '𝖇', '𝕭', '𝓫', '𝓑', '𝒷', '𝐵', '𝕓', '𝔹', 'ʙ', '🄱', 'ᙠ', 'ᵇ', 'ᴮ', 'ⓑ', 
    '๒', 'Ⴆ', '𝐁', '𝗯', '𝗕', '𝘣', '𝘉', '𝙗', '𝘽', '𝚋', '𝙱', 'ɮ', 'Ᏸ', 'ც', '๖', 'ß', '฿', '乃', 'ҍ', 'ḃ', 'ḅ', 'ḇ', '⒝', '𝑏', '𝒃', '𝖻'],
    //C
    ['c', 'ϲ', 'ᴄ', 'ⅽ', 'ⲥ', 'ꮯ', '𐐽', '𝐜', 'ｃ', 'с', 'ƈ', 'ċ', 'ℂ', 'ℭ', 'ꓚ', '𐊢', '🝌', '🇨', '©️', '𝔠', '𝖈', '𝕮', '𝕔', '𝓬', '𝓒', '𝒸', '𝒞', '🄲', '🅲', 'Ɔ', 'ᶜ', 'ⓒ', '𝐂', '𝗰', '𝗖', '𝘤', '𝘊', '𝙘', '𝘾', 
    '𝚌', '𝙲', '¢', 'ᄃ', 'Ç', '₵', '匚', 'Ϛ', 'ᑕ', 'ᑢ', 'Ć', 'Č', 'ḉ', 'ĉ', '⒞', '𝑐', '𝒄', '𝖼', '𝘤'],
    //D
    ['d', 'Ꮷ', 'ᑯ', 'ⅆ', 'ⅾ', 'ꓒ', '𝐝', 'ԁ', 'ɗ', 'Ꭰ', 'ᗞ', 'ᗪ', 'ⅅ', 'ꓓ', '🇩', '𝔡', '𝔇', '𝖉', '𝕯', 'ｄ', '∂', '𝓭', '𝓓', '𝒹', '𝒟', '𝕕', '𝔻', '🄳', '🅳', 'ᗡ', 'ᵈ', 'ᴰ', 'ⓓ', '๔', 'ԃ', '𝐃', '𝗱', '𝗗', 
    '𝘥', '𝘋', '𝙙', '𝘿', '𝚍', '𝙳', 'ɖ', 'Ꮄ', '໓', 'Ð', 'Đ', 'の', 'ᕲ', 'Ď', 'ḋ', 'ḍ', 'ḏ', 'ḑ', 'ḓ', '⒟', '𝑑', '𝒅', '𝖽'],
    //E
    ['e', 'ҽ', '℮', 'ℯ', 'ⅇ', 'ꬲ', '𝐞', 'ｅ', 'е', 'ẹ', 'ė', 'é', 'è', 'Ε', 'Ꭼ', 'ℰ', '⋿', 'ⴹ', 'ꓰ', '𐊆', '🇪', 'э', 'ё', '3', '3️⃣', '𝔢', '𝔈', '𝖊', '𝕰', '𝓮', '𝓔', '𝑒', '𝐸', '𝕖', '𝔼', 'ᴇ', '🄴', '🅴', 'ǝ', 
    'ɘ', 'ₑ', 'ᵉ', 'ᴱ', 'ⓔ', 'є', '𝐄', '𝗲', '乇', '𝗘', '𝘦', '𝘌', '𝙚', '𝙀', 'έ', '𝚎', '𝙴', 'ɛ', 'Ꮛ', 'ē', 'ê', '£', 'Ɇ', 'ᘿ', 'ᗱ', 'ᗴ', '€', '𝒆', 'ế', 'ề', 'ể', 'ễ', 'ë', 'ḕ', 'ḗ', 'ĕ', 'ę', 'ě', 'ȅ', 
    'ȇ', 'ȩ', 'ḝ', 'ḙ', 'ḛ', 'ệ', 'ẻ', 'ẽ', '⒠', '𝖾'],
    //F
    ['f', 'ſ', 'ք', 'ẝ', 'ꞙ', 'ꬵ', '𝐟', 'Ϝ', 'ᖴ', 'ℱ', 'ꓝ', '𐊇', '🇫', '𝔣', '𝔉', '𝖋', '𝕱', '𝕗', '𝔽', '𝓯', '𝓕', '𝒻', '𝐹', 'ｆ', 'ꜰ', '🄵', '🅵', 'Ⅎ', 'ɟ', 'ꟻ', 'Ꮈ', 'ᶠ', 'ⓕ', 'Ŧ', '𝐅', '𝗳', '𝗙', '𝘧', '𝘍', 
    '𝙛', '𝙁', '𝚏', '𝙵', 'ʄ', 'ƒ', '₣', '千', 'ғ', '𝒇', 'ḟ', '⒡', '𝑓', '𝖿'],
    //G
    ['g', 'ƍ', 'ɡ', 'ց', 'ᶃ', 'ℊ', '𝐠', '𝑔', '𝒈', '𝓰', '𝔤', '𝕘', '𝖌', '𝗀', '𝗴', '𝘨', '𝙜', '𝚐', 'ｇ', 'ġ', 'Ԍ', 'Ꮐ', 'Ᏻ', 'ꓖ', '𝐆', '𝐺', '𝑮', '𝒢', '𝓖', '𝔊', '𝔾', '𝕲', '𝖦', '𝗚', '𝘎', '𝙂', '𝙶', '🇬', 
    '6', '9', '6️⃣', '9️⃣', 'Ꮆ', 'ɢ', '🄶', '🅶', '⅁', 'ɓ', 'ᵍ', 'ᴳ', 'ᘜ', 'ⓖ', 'ﻮ', 'ɠ', 'ງ', '₲', 'ģ', 'Ğ', 'Ǥ', 'ĝ', 'ǧ', 'ǵ', 'ḡ', '⒢'],
    //H
    ['h', 'һ', 'հ', 'Ꮒ', 'ℎ', '𝐡', '𝒉', '𝒽', '𝓱', '𝔥', '𝕙', '𝖍', '𝗁', '𝗵', '𝘩', '𝙝', '𝚑', 'ｈ', 'Η', 'Ꮋ', 'ᕼ', 'ℋ', 'ℌ', 'ℍ', 'Ⲏ', 'ꓧ', '𐋏', '𝐇', '𝐻', '𝑯', '𝓗', '𝕳', '𝖧', '𝗛', '𝘏', '𝙃', '𝙷', 
    '𝚮', '𝛨', '𝜢', '𝝜', '𝞖', '🇭', 'н', 'ʜ', '🄷', '🅷', 'ɥ', 'ん', 'ₕ', 'ʰ', 'ᴴ', 'ⓗ', 'ђ', 'ԋ', 'ɦ', 'ɧ', 'Ή', 'Ⱨ', '卄', 'Ƕ', 'Ĥ', 'ħ', 'ȟ', 'ḣ', 'ḥ', 'ḧ', 'ḩ', 'ḫ', 'ẖ', '⒣'],
    //I
    ['i', 'ı', 'ɩ', 'ɪ', 'ι', 'і', 'ӏ', 'Ꭵ', 'ℹ', 'ⅈ', 'ⅰ', '⍳', 'ꙇ', '\\|', 'ǀ', '׀', 'ߊ', 'ᛁ', 'ℐ', 'ℑ', 'ℓ', '∣', 'Ⲓ', 'ⵏ', 'ꓲ', '𐊊', '𐌉', 'í', 'ï', '🇮', '1', '1️⃣', '𝔦', '𝖎', '𝕴', 'ｉ', '𝓲', '𝓘', '𝒾', 
    '𝐼', '𝕚', '𝕀', '🄸', '🅸', 'ᵢ', 'ⁱ', 'ᴵ', 'ⓘ', 'เ', '𝐢', '𝐈', '𝗶', '𝗜', '𝘪', '𝘐', '𝙞', '𝙄', 'ﾉ', '𝚒', '𝙸', 'ɨ', 'Ì', 'ł', '丨', 'į', 'ᓰ', 'î', 'ḯ', 'ĩ', 'ī', 'ĭ', 'ǐ', 'ȉ', 'ȋ', 'ḭ', 'ỉ', 'ị', '⒤', 
    '𝑖', '𝒊', '𝗂'],
    //J
    ['j', 'ϳ', 'ј', 'ⅉ', '𝐣', '𝑗', '𝒋', '𝒿', '𝓳', '𝔧', '𝕛', '𝖏', '𝗃', '𝗷', '𝘫', '𝙟', '𝚓', 'ｊ', 'Ꭻ', 'ᒍ', 'ꓙ', 'Ʝ', '𝐉', '𝐽', '𝑱', '𝒥', '𝓙', '𝔍', '𝕁', '𝕵', '𝖩', '𝗝', '𝘑', '𝙅', '𝙹', '🇯', 'Ĵ', 'ᴊ', '🄹', '🅹', 
    'ɾ', 'Ⴑ', 'ꞁ', 'ⱼ', 'ʲ', 'ᴶ', 'ⓙ', 'ן', 'Ꮭ', 'ว', 'נ', 'ﾌ', 'ل', 'ᒚ', 'ᒎ', 'ڶ', 'ǰ', '⒥'],
    //K
    ['k', '𝐤', '𝑘', '𝒌', '𝓀', '𝓴', '𝕜', '𝗄', '𝗸', '𝘬', '𝙠', '𝚔', 'Κ', 'Ꮶ', 'ᛕ', 'Ⲕ', 'ꓗ', 'Ｋ', '🇰', 'к', '𝔨', '𝔎', '𝖐', '𝕶', '𝓚', '𝒦', '𝕂', 'ᴋ', '🄺', '🅺', '⋊', 'ʞ', 'ₖ', 'ᵏ', 'ᴷ', 'ⓚ', 'ƙ', '𝐊', 
    '𝗞', '𝘒', '𝙆', '𝙺', 'ӄ', '₭', 'Ҝ', 'ҟ', 'Ҡ', 'ᖽᐸ', 'Ќ', 'ķ', 'ǩ', 'ḱ', 'ḳ', 'ḵ', '⒦'],
    //L
    ['l', 'ߊ', 'ⅼ', 'Ꮮ', 'ᒪ', 'ℒ', 'Ⳑ', 'ꓡ', '𐐛', 'ḷ', '🇱', '𝔩', '𝔏', '𝖑', '𝕷', '𝓛', '𝕝', '𝓵', '𝓁', '𝐿', '𝕃', 'ｌ', 'ʟ', '🄻', '🅻', '˥', '⅃', 'ₗ', 'ˡ', 'ᴸ', 'ⓛ', 'ɭ', 'ʅ', '𝐥', '𝐋', '𝗹', '𝗟', '𝘭', '𝘓', 
    '1', '1️⃣', '𝙡', '𝙇', '𝚕', '𝙻', 'ᄂ', 'Ⱡ', 'ㄥ', 'Ꝉ', 'Ĺ', 'Ļ', 'ľ', 'ŀ', 'ḹ', 'ḻ', 'ḽ', '⒧', '𝑙', '𝒍', '𝗅'],
    //M
    ['m', 'ⅿ', 'Μ', 'Ϻ', 'Ꮇ', 'ᗰ', 'ᛖ', 'ℳ', 'Ⲙ', 'ꓟ', '𐊰', '𐌑', '𝐌', '𝑀', '𝑴', '𝓜', '𝔐', '𝕄', '𝕸', '𝖬', '𝗠', '𝘔', '𝙈', '𝙼', '𝚳', '𝛭', '𝜧', '𝝡', '🇲', 'м', 'Ⓜ️', 'Ⓜ', '𝔪', '𝖒', '𝓂', 
    '𝓶', '𝕞', 'ｍ', 'ᴍ', '🄼', '🅼', 'ₘ', 'ᵐ', 'ᴹ', '๓', 'ɱ', '𝐦', '𝗺', '𝘮', '𝙢', '𝚖', 'ʍ', 'ﾶ', '爪', 'ᘻ', '₥', 'ḿ', 'ṁ', 'ṃ', '⒨', '𝑚', '𝒎', '𝗆'],
    //N
    ['n', 'ո', 'ռ', '𝐧', '𝑛', '𝒏', '𝓃', '𝓷', '𝔫', '𝕟', '𝖓', '𝗇', '𝗻', '𝘯', '𝙣', '𝚗', 'Ν', 'ℕ', 'Ⲛ', 'ꓠ', 'Ｎ', '🇳', 'п', 'л', 'и', '𝔑', '𝕹', '𝐍', '𝓝', '𝒩', 'ɴ', '🄽', '🅽', 'Ͷ', 'ᴎ', 'ₙ', 'ⁿ', 
    'ᴺ', 'ⓝ', 'ภ', 'ɳ', '𝗡', '𝘕', '𝙉', '𝙽', 'Ꮑ', 'ŋ', 'ຖ', 'ñ', '₦', '几', 'ղ', 'ᑎ', 'ᘉ', 'Ň', 'ᶰ', 'ń', 'ņ', 'ŉ', 'ǹ', 'ṅ', 'ṇ', 'ṉ', 'ṋ', '⒩', '𝔶', '𝖞'],
    //O
    ['o', 'σ', 'ס', '०', '੦', '૦', '௦', '౦', '೦', 'ഠ', '൦', '๐', '໐', 'ဝ', '၀', 'ჿ', '߀', '০', 'ଠ', '୦', 'ዐ', 'Ⲟ', 'ⵔ', '〇', 'ꓳ', '𐊒', '𐊫', '𐐄', '𐓂', 'о', 'ο', 'օ', 'ȯ', 
    'ọ', 'ỏ', 'ơ', 'ó', 'ò', 'ö', '🇴', '0', '🅾️', '⭕', '0️⃣', '𝔬', '𝔒', '𝖔', '𝕺', 'ට', 'ｏ', '𝓸', '𝓞', '𝑜', '𝒪', '𝕠', '𝕆', 'ᴏ', '🄾', 'ₒ', 'ᵒ', 'ᴼ', 'ⓞ', '๏', '𝐨', '𝐎', '𝗼', '𝗢', '𝘰', '𝘖', '𝙤', 
    '𝙊', '𝚘', '𝙾', 'Ꭷ', 'Ꮼ', 'Ө', 'Ø', 'Ỗ', 'º', 'ô', 'ố', 'ồ', 'ổ', 'õ', 'ȭ', 'ṍ', 'ṏ', 'ȫ', 'ō', 'ṑ', 'ṓ', 'ŏ', 'ő', 'ớ', 'ờ', 'ở', 'ỡ', 'ợ', 'ǒ', 'Ǫ', 'ǭ', 'ȍ', 'ȏ', 'ȱ', 'ộ', 'ℴ', '⒪', '𝒐', '𝗈'],
    //P
    ['p', '⍴', 'ⲣ', '𝐩', '𝑝', '𝒑', '𝓅', '𝓹', '𝔭', '𝕡', '𝖕', '𝗉', '𝗽', '𝘱', '𝙥', '𝚙', '𝛒', '𝜌', '𝝆', '𝞀', '𝞺', 'Ρ', 'Р', 'Ꮲ', 'ᑭ', 'ℙ', 'ꓑ', '𐊕', '𝐏', '𝑃', '𝑷', '𝒫', '𝓟', '𝖯', '𝗣', '𝘗', '𝙋', '𝙿', 
    '𝚸', '𝛲', '𝜬', '𝝦', '𝞠', 'Ｐ', '🇵', '🅿️', '𝔓', '𝕻', 'ⓟ', 'ᴘ', '🄿', 'ꟼ', 'ₚ', 'ᵖ', 'ᴾ', 'ק', 'Ꭾ', '℘', 'þ', '₱', '卩', 'ᕵ', 'Ƥ', 'ṕ', 'ṗ', '⒫'],
    //Q
    ['q', 'ԛ', 'գ', 'զ', '𝐪', '𝑞', '𝒒', '𝓆', '𝓺', '𝔮', '𝕢', '𝖖', '𝗊', '𝗾', '𝘲', '𝙦', '𝚚', 'ℚ', 'ⵕ', '𝐐', '𝑄', '𝑸', '𝒬', '𝓠', '𝖰', '𝗤', '𝘘', '𝙌', '𝚀', '🇶', '𝔔', '𝕼', 'ｑ', 'Ǫ', '🅀', '🆀', 'Ό', 'ϙ', 
    'Ꭴ', 'Ɋ', 'Ҩ', 'ᑫ', 'ᕴ', 'Ⓠ', '⒬'],
    //R
    ['r', 'г', 'ᴦ', 'ⲅ', 'ꭇ', 'ꭈ', 'ꮁ', '𝐫', '𝑟', '𝒓', '𝓇', '𝓻', '𝔯', '𝕣', '𝖗', '𝗋', '𝗿', '𝘳', '𝙧', '𝚛', 'Ʀ', 'Ꭱ', 'Ꮢ', 'ᖇ', 'ℛ', 'ℜ', 'ℝ', 'ꓣ', '𐒴', '🇷', '®️', 'я', '𝕽', 'Ř', '𝓡', '𝑅', 'ｒ', '🅁', '🆁', 
    'ᴚ', 'ɹ', 'ɿ', 'ᵣ', 'ʳ', 'ᴿ', 'ⓡ', '尺', 'ɾ', '𝐑', '𝗥', '𝘙', '𝙍', '𝚁', 'Ɽ', 'ŕ', 'ŗ', 'ȑ', 'ȓ', 'ṙ', 'ṛ', 'ṝ', 'ṟ', '⒭'],
    //S
    ['s', 'ƽ', 'ѕ', 'ꜱ', 'ꮪ', '𐑈', 'ｓ', 'Տ', 'Ꮥ', 'ꓢ', '𐊖', 'ʂ', '🇸', '5', '5️⃣', '💲', '𝔰', '𝔖', '𝖘', '𝕾', 'ş', '𝓢', '𝓼', '𝓈', '𝒮', '𝕤', '𝕊', '🅂', '🆂', 'Ꙅ', 'ₛ', 'ˢ', 'ⓢ', 'ร', '𝐬', '𝐒', '𝘀', '𝗦', '𝘴', 
    '𝘚', '𝙨', '𝙎', '𝚜', '𝚂', 'ֆ', '丂', 'Ꭶ', 'Ƨ', '§', '₴', 'ᔕ', 'Ŝ', 'ś', 'ṥ', 'š', 'ṧ', 'ș', 'ṡ', 'ṣ', 'ṩ', '⒮', '𝑠', '𝒔', '𝗌'],
    //T
    ['t', '𝐭', '𝑡', '𝒕', '𝓉', '𝓽', '𝔱', '𝕥', '𝖙', '𝗍', '𝘁', '𝘵', '𝙩', '𝚝', 'Τ', 'Ꭲ', '⊤', '⟙', 'Ⲧ', 'ꓔ', '𐊗', '𐊱', '𐌕', '🇹', 'т', '𝔗', '𝕿', 'Ŧ', '𝓣', '𝒯', '𝕋', 'ｔ', 'ᴛ', '🅃', '🆃', '⊥', 'ʇ', 'ƚ', 'ₜ', 'ᵗ', 
    'ᵀ', 'ⓣ', 'Շ', '𝐓', '𝗧', '𝘛', '𝙏', '𝚃', 'ㄒ', 'է', 'Ͳ', 'ȶ', 'ɬ', 'Ƭ', '†', '₮', 'ᖶ', 'Ť', '丅', 'ţ', 'ț', 'ṫ', 'ṭ', 'ṯ', 'ṱ', 'ẗ', '⒯'],
    //U
    ['u', 'ʋ', 'ᴜ', 'ꭎ', 'ꭒ', '𐓶', 'ሀ', 'ᑌ', '∪', '⋃', 'ꓴ', 'υ', 'ս', 'ü', 'ú', 'ù', '🇺', 'ц', '𝔲', '𝔘', '𝖚', '𝖀', 'Ｕ', '𝐔', '𝓾', '𝓤', '𝓊', '𝒰', '𝕦', '𝕌', '🅄', '🆄', '∩', 'ᵤ', 'ᵘ', 'ᵁ', 'ⓤ', 'ย', 
    '𝐮', '𝘂', '𝗨', '𝘶', '𝘜', '𝙪', '𝙐', '𝚞', '𝚄', 'ʊ', 'ひ', 'ų', 'น', 'ㄩ', 'մ', 'Ʉ', 'վ', 'ᑘ', 'Ǘ', 'û', 'ǖ', 'ǚ', 'ǜ', 'ũ', 'ū', 'ŭ', 'ů', 'ű', 'ư', 'ǔ', 'ṹ', 'ṻ', 'ứ', 'ừ', 'ử', 'ữ', 'ự', 'ȕ', 'ȗ', 
    'ṳ', 'ṵ', 'ṷ', 'ụ', 'ủ', '⒰', '𝑢', '𝒖', '𝗎'],
    //V
    ['v', 'ν', 'ѵ', 'ᴠ', 'ⅴ', '∨', '⋁', 'ꮩ', 'ᐯ', 'ⴸ', 'ꓦ', '🇻', '𝔳', '𝔙', '𝖛', '𝖁', '𝕧', '𝓿', '𝓥', '𝓋', '𝒱', '𝕍', 'ｖ', '🆅', 'Λ', 'ʌ', 'ᵥ', 'ᵛ', 'ⱽ', 'ⓥ', 'ש', '𝐯', '𝐕', '𝘃', '𝗩', '𝘷', '𝘝', '𝙫', 
    '𝙑', '𝚟', '𝚅', 'Ꮙ', '۷', 'ง', '√', 'ᐺ', 'Ѷ', 'ṽ', 'ṿ', '⒱', '𝑣', '𝒗', '𝗏'],
    //W
    ['w', 'ɯ', 'ѡ', 'ԝ', 'ա', 'ᴡ', 'ꮃ', 'Ꮤ', 'ꓪ', '🇼', 'ш', 'щ', '𝔴', '𝔚', '𝖜', '𝖂', 'Ŵ', 'Ｗ', '𝔀', '𝓦', '𝓌', '𝒲', '𝕨', '𝕎', '🅆', '🆆', 'ʍ', 'ʷ', 'ᵂ', 'ⓦ', 'ฬ', '𝐰', '𝐖', '𝘄', '𝗪', '𝘸', 
    '𝘞', '𝙬', '𝙒', '𝚠', '𝚆', 'Ꮗ', 'ῳ', 'ຟ', 'ω', '₩', '山', 'చ', 'ᗯ', 'ᘺ', 'ẁ', 'ẃ', 'ẅ', 'ẇ', 'ẉ', 'ẘ', '⒲', '𝑤', '𝒘', '𝗐'],
    //X
    ['x', '×', 'х', 'ᕁ', 'ᕽ', '᙮', 'ⅹ', '⤫', '⤬', '⨯', '𝐱', '𝑥', '𝒙', '𝓍', '𝔁', '𝔵', '𝕩', '𝖝', '𝗑', '𝘅', '𝘹', '𝙭', '𝚡', 'ｘ', 'Χ', '᙭', 'ᚷ', '╳', 'Ⲭ', 'ⵝ', 'ꓫ', 'Ꭓ', '𐊐', '𐊴', '𐌗', '𐌢', 'ҳ', '🇽', 
    '❌', '❎', '✖️', '𝔛', '𝖃', '𝐗', '𝓧', '𝒳', '乂', '𝕏', '🅇', '🆇', 'ჯ', 'ₓ', 'ˣ', 'ⓧ', 'א', '𝗫', '𝘟', '𝙓', '𝚇', 'Ӽ', 'Ӿ', 'ﾒ', 'ẋ', 'ẍ', '⒳'],
    //Y
    ['y', 'ɣ', 'ʏ', 'γ', 'у', 'ү', 'ყ', 'ᶌ', 'ỿ', 'ℽ', 'ꭚ', 'Υ', 'ϒ', 'Ꭹ', 'Ꮍ', 'Ⲩ', 'ꓬ', '𐊲', 'ý', '🇾', '𝔶', '𝔜', '𝖞', '𝖄', '¥', '𝓎', '𝔂', '𝓨', '𝒴', '𝕪', '𝕐', 'ｙ', '🅈', '🆈', '⅄', 'ʎ', 'ʸ', 'ⓨ', 
    'ץ', '𝐲', '𝐘', '𝘆', '𝗬', 'ㄚ', '𝘺', '𝘠', '𝙮',' 𝙔', '𝚢', '𝚈', 'ฯ', 'Ɏ', 'ﾘ', 'Ӌ', 'ᖻ', 'ч', 'Ƴ', 'Ў', 'ÿ', 'ŷ', 'ȳ', 'ẏ', 'ẙ', 'ỳ', 'ỵ', 'ỷ', 'ỹ', '⒴', '𝑦', '𝒚', '𝗒'],
    //Z
    ['z', 'ᴢ', 'ꮓ', 'Ζ', 'ℤ', 'ꓜ', 'Ｚ', 'ʐ', 'ż', '🇿', '𝖟', '𝖅', 'ⓩ', 'ž', '𝔃', '𝓩', '𝓏', '𝒵', '𝕫', '🅉', '🆉', 'Ƹ', 'ᶻ', 'չ', 'ȥ', '𝐳', '𝐙', '𝘇', '𝗭', '𝘻', '𝘡', '𝙯', '𝙕', '𝚣', '𝚉', 'ʑ', 'Ⱬ', '乙', 
    'ɀ', 'ᘔ', 'Ƶ', 'ź', 'ẑ', 'ẓ', 'ẕ', '⒵', '𝑧', '𝒛', '𝔷', '𝗓']
];

/**
 * Finds all blacklist table entries and regenerates blacklist_regexp
 */
function generateBlacklist() {
    blacklist
        .findAll()
        .then(entries => {
            const regexp_source = entries
                .map(e => e.word
                    .toLowerCase()
                    .replace(
                        /\[\^?([-A-Za-z]+?)\]|([A-Za-z])/g, 
                        (match, set, single) => {
                            //set is like '[abc]'
                            //single is just 'a'

                            //convert range set to full set
                            //ex: [a-d] => [abcd]
                            set = set ? set.replace(/([A-Za-z])-([A-Za-z])/g, (match, range_start, range_end) => {
                                let range_all = '';
                                const first_code = range_start.charCodeAt(0);
                                const last_code = range_end.charCodeAt(0);
                                for (let i = first_code; i <= last_code; i++) range_all += String.fromCharCode(i);
                                return range_all;
                            }) : null;

                            //finds confusables and spreads them into array or just returns the char itself
                            const chars = [...(set ?? single)].flatMap(char => confusables.find(set => set[0] === char) ?? char);

                            //converting to set and spreading into new array removes duplicates
                            return `(?:${[...new Set(chars)].join('|')})`;
                        }
                    )
                )
                .join('|');

            blacklist_regexp = new RegExp(regexp_source, 'ig');
            console.log(blacklist_regexp);
        })
        .catch(console.error);
}

/**
 * @returns cached blacklist regular expression
 */
function getBlacklist() {
    return blacklist_regexp;
}

//arrays of cached ids
let whitelisted_users = [];
let whitelisted_channels = [];
let whitelisted_roles = [];

/**
 * Finds all whitelist table entries and filters them into corresponding caches
 */
function generateWhitelists() {
    whitelist
        .findAll()
        .then(entries => {
            whitelisted_users = [];
            whitelisted_roles = [];
            whitelisted_channels = [];

            entries.forEach(entry => {
                switch (entry.type) {
                    case '@':
                        whitelisted_users.push(entry.id);
                        break;
                    case '@&':
                        whitelisted_roles.push(entry.id);
                        break;
                    case '#':
                        whitelisted_channels.push(entry.id);
                }
            });
        })
        .catch(console.error);
}

/**
 * @param {Message}
 * @returns True if message meets whitelist criteria
 */
function checkWhitelists(message) {
    return whitelisted_users?.includes(message.author.id) 
        || whitelisted_channels?.includes(message.channelId) 
        || message.member?.roles.cache.some(role => whitelisted_roles?.includes(role.id) );
}

/**
 * @param {TextChannel} channel
 * @returns {Promise<Webhook>} Fetched or newly created GudBot-owned webhook
 */
async function fetchOrCreateHook(channel) {
    //first check local cache
    let hook = webhooks_cache.get(channel.id);
    if (hook) return hook;

    //then fetch and check channel's existing webhooks
    const channel_hooks = await channel.fetchWebhooks().catch(console.error);
    hook = channel_hooks?.find(hook => hook.owner.id === ids.client);
    if (hook) {
        //cache it
        webhooks_cache.set(channel.id, hook);
        return hook;
    }

    //if it doesn't exist, create and cache it
    hook = await channel.createWebhook('GudBot').catch(console.error);
    if (hook) {
        webhooks_cache.set(channel.id, hook);
        return hook;
    }
    
    //couldnt fetch or create
    return null;
}

/**
 * @param {string} content 
 * @returns {string|null} Censored message content or null if censorship was unnecessary
 */
function parseContent(content) {
    const time1 = new Date().getTime();

    let modified = false;

    /**
     * Strings that have to be reinserted after censorship
     * @type {{ str: string; is_splitter: boolean; reinsert_idx: number; lookup_idx: number; }[]}
     */
    let reinsertions = [];

    //the sum of all saved reinsertions' string's length
    let reinsert_length = 0;

    //the sum of all discarded zero-width string's length
    let discarded_length = 0;

    //remove and later reinsert
    //custom emojis:    <:\w{2,32}:[0-9]{17,19}>
    //urls:             https?:\/\/\w{2}\S+
    //whitespace:       \s+
    //formatters:       [*~`|]+
    //special chars:    [!@#$%^&()\-_+={}\[\]\\/:;'"<>,.?…‚„ˆ‹›‘’“”•–—˜™¦¨«¬¯´·¸»¿]+
    //
    //remove and do NOT reinsert
    //zero-width chars: [\u200b-\u200f\u2060-\u2064\u206a-\u206f\u17b4-\u17b5\u00ad\u034f\u061c\u180e]+
    content = content.replace(
        /(<:\w{2,32}:[0-9]{17,19}>)|(https?:\/\/\w{2}\S+)|(\s+)|([*~`|]+)|([\u0021-\u0029\u002b-\u002f\u003a-\u0040\u005b-\u005f\u007b\u007d\u00a6\u00a8\u00ab\u00ac\u00af\u00b4\u00b7\u00b8\u00bb\u00bf\u02c6\u02dc\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2022\u2026\u2039\u203a\u2122]+)|[\u200b-\u200f\u2060-\u2064\u206a-\u206f\u17b4-\u17b5\u00ad\u034f\u061c\u180e]+/g, 
        (match, emoji, url, spaces, formatters, special, index) => {
            //save everything but zero width chars for reinsertion later
            if (emoji ?? url ?? spaces ?? formatters ?? special) {
                const idx = index - discarded_length;
                reinsertions.push({
                    str: match,
                    is_splitter: !!(spaces || special),
                    reinsert_idx: idx,
                    lookup_idx: idx - reinsert_length
                });
                //keep track of how many reinsertions were removed (total char length), so that we could look up their would-be indexes in the 'clean' string
                reinsert_length += match.length;
            }
            //zero width characters will be discarded, so we have to keep track of how many chars were removed to adjust reinsertion indexes
            else discarded_length += match.length;

            //remove
            return '';
        }
    );

    //replace blacklisted words with stars
    let censored = content.replace(blacklist_regexp, (word, index) => {
        //check if word begins with repeating letter (ex: tttest)
        const repeating_prefix = index + word.search(/^([A-Za-z])\1+/);
        //check if word ends on repeating letter (ex: testsss)
        const repeating_suffix = index + word.search(/([A-Za-z])\1+$/);

        //will be prepended to censored word at the end if necessary
        let prefix = '';
        //will be appended to censored word at the end if necessary
        let suffix = '';

        //if not found, repeating idx will be index - 1, hence the >=
        let look_for_prefix = repeating_prefix >= index;
        let look_for_suffix = repeating_suffix >= index;

        if (look_for_prefix || look_for_suffix) {
            //index of first char after word
            const end_index = index + word.length;

            //look for repeating prefix before this index
            const repeating_prefix_end = look_for_suffix ? repeating_suffix : end_index;

            //find last reinsertion within either repeating pattern
            for (let i = reinsertions.length - 1; i >= 0; i--) {
                const { str, lookup_idx } = reinsertions[i];

                //check repeating suffix pattern
                if (look_for_suffix && lookup_idx >= repeating_suffix && lookup_idx < end_index) {
                    //split off everything that comes after reinsertion
                    suffix = str + word.substring(lookup_idx - index);
                    word = word.substring(0, lookup_idx - index);

                    //delete reinsertion
                    reinsertions.splice(i, 1);
                    
                    //suffix found
                    look_for_suffix = false;
                }
                //check repeating prefix pattern
                else if (look_for_prefix && lookup_idx >= repeating_prefix && lookup_idx < repeating_prefix_end) {
                    //split off everything that comes before reinsertion
                    prefix = word.substring(0, lookup_idx - index) + str;
                    word = word.substring(lookup_idx - index);

                    //delete reinsertion
                    reinsertions.splice(i, 1);

                    //prefix found
                    look_for_prefix = false;
                }

                //do not continue searching if both found (or didnt need to be found in the first place)
                if (!look_for_prefix && !look_for_suffix) break;
            }
        }

        //spread word into array of chars
        let chars = [...word];

        //replace every char after the first with stars
        for (let i = 1; i < chars.length; i++) { 
            chars[i] = '⋆'; // '\\*'
        }

        //join censored chars together
        const censored_word = chars.join('');

        //if word consisted of surrogative pairs, it will be shorter after censorship
        const length_diff = word.length - censored_word.length;

        //if length_diff != 0
        if (length_diff) {
            //index of first char after word (may have changed, which is why I don't use the previous one)
            const end_index = index + word.length;

            //adjust reinsertion indexes of strings that come after word
            reinsertions = reinsertions.map(e => {
                if (e.lookup_idx >= end_index) e.reinsert_idx -= length_diff;
                return e;
            });
        }

        //note that censorship was done
        modified = true;

        //replace uncensored word
        return prefix + censored_word + suffix;
    });

    //if content was not modified, meaning no censorship was necessary => do not proceed further
    if (!modified) return null;

    //reinsert previously removed strings
    discarded_length = 0;
    reinsertions.forEach(e => {
        const { str, is_splitter, reinsert_idx } = e;

        //adjust index based on how many prior chars were discarded
        const index = reinsert_idx - discarded_length;

        //do not reinsert splitters (spaces or special chars) if next char is a star, but keep track of how many splitters were discarded
        if (is_splitter && censored[index] === '⋆')
            discarded_length += str.length;
        //reinsert
        else censored = censored.substring(0, index) + str + censored.substring(index);
    });

    const time2 = new Date().getTime();
    console.log(`censoring: ${time2-time1}ms`);

    //return the successfully censored content
    return censored;
}

/**
 * Detects blacklisted words in message content, censors them and resends the message with a webhook so as to mimic original author's name and avatar.
 * @param {Message} message 
 * @returns {Promise<boolean>} Whether or not message was censored.
 */
async function censorMessage(message) {
    //only check messages in server
    if (message.channel.guildId !== ids.guild) return;

    //threads dont have webhooks, so in that case we get the parent channel
    const is_thread = message.channel.isThread();
    const channel = is_thread ? message.channel.parent : message.channel;

    //fetch/create channel webhook if it's not in cache
    //we do this on every messageCreate, not just the ones that need to be censored, so as to populate the cache
    const fetch_hook = fetchOrCreateHook(channel).catch(console.error);

    //don't do anything if content is empty
    if (!message.content) return false;

    //don't do anything if regexp is empty
    if (blacklist_regexp.source === '(?:)') return false;

    //dont censor message if sent in whitelisted channel or by whitelisted user
    if (checkWhitelists(message)) return false;

    //find blacklisted words in message content and censor if necessary
    let censored = parseContent(message.content);

    //if no blacklisted words found, do not proceed further
    if (!censored) return false;

    //prepend fake reply to beginning of censored message content
    if (message.type === 'REPLY') {
        //catch exception if reply isnt found (non critical error)
        const replied_msg = await message.fetchReference().catch(e => logUnless(e, ids.errors.unknown_message));
        censored = prependFakeReply(censored, replied_msg);
    }

    //split message if it's too big
    let censored_followup;

    const max_length = 2000; // - star_count;
    if (censored.length > max_length) {

        const cutoff_index = findLastSpaceIndex(censored, max_length);
        censored_followup = censored.substring( cutoff_index );

        //if cutoff point was a newline, add fake bold ** ** to preserve it in the beginning of the followup message
        if (censored_followup.startsWith('\n')) 
            censored_followup = `** **${censored_followup}`
        
        censored = censored.substring(0, cutoff_index);
    }

    //mimic original author's name and pfp
    //mentions are disabled because we dont want to ping people twice
    let message_options = {
        content: censored,
        username: message.member.displayName,
        avatarURL: message.member.displayAvatarURL(),
        allowedMentions: { parse: [] },
        threadId: is_thread ? message.channelId : null
    };

    //check if original message had attachments and filter out ones that are above the current guild's upload size limit
    const attachments = [...message.attachments?.filter(file => file.size <= getGuildUploadLimit(message.guild) ).values()];
    //add the attachments to the message if there will be no followup (we dont want the attachments to between the intial and followup message)
    if (!censored_followup && attachments.length > 0) message_options.files = attachments;

    //delete user's original uncensored message
    message.delete().catch(e => logUnless(e, ids.errors.unknown_message));
    console.log('deleting uncensored');

    //await for fetch_hook resolve
    const hook = await fetch_hook;
    if (!hook) return false;

    const send = [];
    send.push(
        //send censored message through webhook
        hook.send(message_options)
            //then cache message id and corresponding author id, so that we could check this for the jail context menu command
            .then(new_message => {
                cacheAuthorId(new_message.id, message.author.id);
                
                //check newly censored message for spam
                let hybrid_message = new_message;
                hybrid_message.author = message.author;
                hybrid_message.member = message.member;
                addToMessageGroups(hybrid_message).catch(console.error);
            })
    );
    
    //this is part 2 of large messages
    if (censored_followup) {
        //reuse the same MessageOptions, just change the text content
        message_options.content = censored_followup;
        //if attachments were not sent with first message
        if (attachments.length > 0) message_options.files = attachments;
        
        send.push(
            //send censored message through webhook
            hook.send(message_options)
                //then cache message id and corresponding author id, so that we could check this for the jail context menu command
                .then(new_message => cacheAuthorId(new_message.id, message.author.id))
        );
    }

    console.log('sending censored');
    //await both messages to be sent
    const has_sent = await Promise.all(send);

    return has_sent;
}

module.exports = {
    censored_authors_cache,
    generateBlacklist,
    getBlacklist,
    generateWhitelists,
    checkWhitelists,
    censorMessage
};