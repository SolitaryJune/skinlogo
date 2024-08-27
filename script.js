// 初始化LeanCloud
AV.init({
  appId: "P3Y2NC8ixdNbpJ12bwmpJMxl-gzGzoHsz",
  appKey: "zTmnzxgSaTRcDVkVR326wUaZ",
  serverURL: "https://p3y2nc8i.lc-cn-n1-shared.com"
});

// Base64解码函数
const custom_base64_chars = 'ZYXWVUTSRQPONMLKJIHGFEDCBAabcdefghijklmnopqrstuvwxyz0123456789+-';
function decodeBase64(input) {
  if (!input || input.length % 4 !== 0) {
      console.error("输入的 Base64 编码长度不是 4 的倍数");
      return null;
  }
  const str = input.replace(/=+$/, '');
  let triplet = 0;
  let j = 0;
  const byteArray = [];
  for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const index = custom_base64_chars.indexOf(char);
      if (index === -1) {
          console.error("无效的 Base64 字符: " + char);
          return null;
      }
      triplet = (triplet << 6) | index;
      j++;
      if (j === 4) {
          byteArray.push((triplet >> 16) & 0xFF);
          byteArray.push((triplet >> 8) & 0xFF);
          byteArray.push(triplet & 0xFF);
          triplet = 0;
          j = 0;
      }
  }
  if (j === 2) {
      byteArray.push((triplet >> 4) & 0xFF);
  } else if (j === 3) {
      byteArray.push((triplet >> 10) & 0xFF);
      byteArray.push((triplet >> 2) & 0xFF);
  }
  return new TextDecoder().decode(new Uint8Array(byteArray));
}

// 身份验证函数
async function authenticate() {
  const authInput = document.getElementById('authInput').value;
  const [timestamp, account] = decodeBase64(authInput).split('@@');
  const currentTime = Date.now();
  if (currentTime - parseInt(timestamp) > 300000) {
      alert('授权码已过期');
      return;
  }
  const query = new AV.Query('account');
  query.equalTo('Account', account);
  try {
      const result = await query.first();
      if (result) {
          document.getElementById('mainContent').style.display = 'block';
      } else {
          alert('未获授权,请前往shop.gushao.club购买！');
      }
  } catch (error) {
      console.error('Error:', error);
      alert('验证失败');
  }
}

// 切片处理函数
async function processSlice() {
  const imageFile = document.getElementById('imageInput').files[0];
  const tilFile = document.getElementById('tilInput').files[0];
  if (!imageFile || !tilFile) {
      alert('请选择图片和TIL文件');
      return;
  }
  const tilContent = await tilFile.text();
  const tilData = parseTilFile(tilContent);
  const image = await createImageBitmap(imageFile);
  const slices = sliceImage(image, tilData);
  const zip = new JSZip();
  slices.forEach((slice, index) => {
      zip.file(`IMG${index + 1}.png`, slice);
  });
  zip.file(tilFile.name, tilContent);
  zip.generateAsync({type: "blob"}).then(function(content) {
      saveAs(content, "slices.zip");
  });
}

// TIL文件解析函数
function parseTilFile(content) {
  const lines = content.split('\n');
  const data = {
      tileNum: 0,
      slices: []
  };
  lines.forEach(line => {
      if (line.startsWith('TILE_NUM=')) {
          data.tileNum = parseInt(line.split('=')[1]);
      } else if (line.startsWith('SOURCE_RECT=')) {
          const [x, y, width, height] = line.split('=')[1].split(',').map(Number);
          data.slices.push({x, y, width, height});
      }
  });
  return data;
}

// 图片切片函数
function sliceImage(image, tilData) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  return tilData.slices.map(({x, y, width, height}, index) => {
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
      return new Promise(resolve => {
          canvas.toBlob(resolve, 'image/png');
      });
  });
}

// 合成切片函数
async function processMerge() {
  const zipFile = document.getElementById('mergeZipInput').files[0];
  const direction = document.getElementById('mergeDirection').value;
  if (!zipFile) {
      alert('请选择ZIP文件');
      return;
  }
  
  try {
      const zip = await JSZip.loadAsync(zipFile);
      const imageFiles = [];
      for (let filename in zip.files) {
          if (filename.match(/IMG\d+\.png/i)) {
              imageFiles.push({
                  name: filename,
                  file: await zip.file(filename).async("blob")
              });
          }
      }
      
      // 按文件名排序
      imageFiles.sort((a, b) => {
          const numA = parseInt(a.name.match(/\d+/)[0]);
          const numB = parseInt(b.name.match(/\d+/)[0]);
          return numA - numB;
      });

      const images = await Promise.all(imageFiles.map(file => createImageBitmap(file.file)));
      const mergedImage = await mergeImages(images, direction);
      
      const resultZip = new JSZip();
      resultZip.file("merged.png", mergedImage);
      const content = await resultZip.generateAsync({type: "blob"});
      saveAs(content, "merged.zip");
  } catch (error) {
      console.error('Error processing zip file:', error);
      alert('处理ZIP文件时出错');
  }
}

// 图片合成函数
async function mergeImages(images, direction) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (direction === 'horizontal') {
      canvas.width = images.reduce((sum, img) => sum + img.width, 0);
      canvas.height = Math.max(...images.map(img => img.height));
      let x = 0;
      images.forEach(img => {
          ctx.drawImage(img, x, 0);
          x += img.width;
      });
  } else {
      canvas.width = Math.max(...images.map(img => img.width));
      canvas.height = images.reduce((sum, img) => sum + img.height, 0);
      let y = 0;
      images.forEach(img => {
          ctx.drawImage(img, 0, y);
          y += img.height;
      });
  }
  return new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png');
  });
}

// 重命名图片函数
async function processRename() {
  const files = document.getElementById('renameImageInput').files;
  const newNames = document.getElementById('newNames').value.split('\n');
  if (files.length === 0 || newNames.length === 0) {
      alert('请选择图片并输入新文件名');
      return;
  }
  const zip = new JSZip();
  for (let i = 0; i < files.length; i++) {
      const newName = newNames[i] || `renamed_${i + 1}.png`;
      zip.file(newName, await files[i].arrayBuffer());
  }
  zip.generateAsync({type: "blob"}).then(function(content) {
      saveAs(content, "renamed.zip");
  });
}
// 新增：复制图片函数
async function processDuplicate() {
  const imageFile = document.getElementById('duplicateImageInput').files[0];
  const newNames = document.getElementById('duplicateNames').value.split('\n').filter(name => name.trim() !== '');
  
  if (!imageFile) {
      alert('请选择一张图片');
      return;
  }
  
  if (newNames.length === 0) {
      alert('请输入至少一个新文件名');
      return;
  }

  try {
      const imageBuffer = await imageFile.arrayBuffer();
      const zip = new JSZip();
      
      newNames.forEach(name => {
          zip.file(name.trim(), imageBuffer);
      });

      const content = await zip.generateAsync({type: "blob"});
      saveAs(content, "duplicated_images.zip");
  } catch (error) {
      console.error('Error duplicating image:', error);
      alert('复制图片时出错');
  }
}

 // 新增：使用文件名复制图片函数
 async function processDuplicateWithFiles() {
  const imageFiles = document.getElementById('mainImageInput').files;
  const nameFiles = document.getElementById('nameFilesInput').files;
  
  if (imageFiles.length === 0) {
      alert('请选择至少一张图片');
      return;
  }
  
  if (nameFiles.length === 0) {
      alert('请选择至少一个用于命名的文件');
      return;
  }

  try {
      const zip = new JSZip();
      
      for (let i = 0; i < nameFiles.length; i++) {
          const imageFile = imageFiles[i % imageFiles.length]; // 循环使用图片文件
          const imageBuffer = await imageFile.arrayBuffer();
          zip.file(nameFiles[i].name, imageBuffer);
      }

      const content = await zip.generateAsync({type: "blob"});
      saveAs(content, "duplicated_images_with_filenames.zip");
  } catch (error) {
      console.error('Error duplicating images with filenames:', error);
      alert('使用文件名复制图片时出错');
  }
}


// // 切换操作类型
// document.getElementById('operationSelect').addEventListener('change', function(e) {
//   // 隐藏所有内容
//   document.querySelectorAll('div[id$="Content"]').forEach(div => {
//       div.style.display = 'none';
//   });
//   // 显示选中的操作内容
//   document.getElementById(e.target.value + 'Content').style.display = 'block';
// });

// 切换操作类型
document.getElementById('operationSelect').addEventListener('change', function(e) {
  document.getElementById('sliceContent').style.display = e.target.value === 'slice' ? 'block' : 'none';
  document.getElementById('mergeContent').style.display = e.target.value === 'merge' ? 'block' : 'none';
  document.getElementById('renameContent').style.display = e.target.value === 'rename' ? 'block' : 'none';
  document.getElementById('duplicateContent').style.display = e.target.value === 'duplicate' ? 'block' : 'none';
  document.getElementById('duplicateWithFilesContent').style.display = e.target.value === 'duplicateWithFiles' ? 'block' : 'none';
});
