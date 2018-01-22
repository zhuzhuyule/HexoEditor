/*
 *  This file is part of Moeditor.
 *
 *  Copyright (c) 2016 Menci <huanghaorui301@gmail.com>
 *
 *  Moeditor is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  Moeditor is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with Moeditor. If not, see <http://www.gnu.org/licenses/>.
 */

window.mkdirsSync = (dirpath, mode) => {
    if (!fs.existsSync(dirpath)) {
        var pathtmp;
        dirpath.split(path.sep).forEach(function (dirname) {
            if (pathtmp) {
                pathtmp = path.join(pathtmp, dirname);
            }
            else {
                pathtmp = dirname;
            }
            if (!fs.existsSync(pathtmp)) {
                if (!fs.mkdirSync(pathtmp, mode)) {
                    return false;
                }
            }
        });
    }
    return true;
}

window.md5 = (text) => {
    return require('crypto').createHash('md5').update(text).digest('hex');
};

class ImgManager {
    constructor() {
        this.fileName = path.basename(hexoWindow.fileName, path.extname(hexoWindow.fileName)) || hexoWindow.ID || "";
        this.imgMD5IDList = {};
        this.imgPathIDList = {};
        this.imgBasePath = '';
        this.type = {
            png: '.png',
            jpg: '.jpg',
            jpeg: '.jpg',
            bmp: '.bmp'
        }
        this.updateBase();
    }

    updateBase() {
        let rootPaht = '';
        if (moeApp.config.get('image-path')) {
            rootPaht = moeApp.config.get('image-path');
        } else if (moeApp.useHexo && hexo.config.__basedir) {
            rootPaht = path.join(hexo.config.__basedir, 'source', 'images');
        } else {
            rootPaht = hexoWindow.directory;
        }
        rootPaht = rootPaht.replace(/\\/g, '/');
        if (this.imgBasePath && this.imgBasePath !== rootPaht) {
            try {
                fs.renameSync(path.join(this.imgBasePath, this.fileName), path.join(rootPaht, this.fileName));
            } catch (e) {
                fs.renameSync(path.join(this.imgBasePath, this.fileName), path.join(rootPaht, this.fileName));
            }
            this.updateDictionary(this.imgBasePath, rootPaht)
        }
        this.imgBasePath = rootPaht;
    }

    relativePath(p) {
        if (hexoWindow.useHexo)
            return '/images/' + path.relative(this.imgBasePath, p).replace(/\\/g, '/');
        return '/' + path.relative(this.imgBasePath, p).replace(/\\/g, '/');
    }

    resolvePath(p) {
        if (path.isAbsolute(p))
            p = '.' + p;
        if (hexoWindow.useHexo) {
            if ([0, 1].includes(p.indexOf('images/')))
                return path.resolve(this.imgBasePath, '..', p).replace(/\\/g, '/');
        }
        return path.resolve(this.imgBasePath, p).replace(/\\/g, '/');
    }

    getImage(img) {
        if (typeof img === "string") {
            return this.getImageOfPath(img)
        }
        return this.getImageOfObj(img)
    }

    getImageOfPath(imgPath, md5ID) {
        if (fs.existsSync(imgPath)) {
            imgPath = imgPath.replace(/\\/g, '/');
            let relativePath = '';
            if (this.imgPathIDList[imgPath]) {
                relativePath = this.imgPathIDList[imgPath];
            } else {
                relativePath = '/' + path.relative(this.imgBasePath, imgPath).replace(/\\/g, '/');
                this.imgPathIDList[imgPath] = relativePath;
                if (md5ID) {
                    this.imgMD5IDList[md5ID] = imgPath;
                }
            }
            return relativePath
        }
    }

    getImageOfObj(imgObject, imgName, ext) {
        if (!ext || ext == '.png') {
            imgObject = imgObject.toPNG();
        } else if (ext == '.bmp') {
            imgObject = imgObject.toBitmap();
        } else if (ext == '.jpg') {
            imgObject = imgObject.toJPEG(100);
        } else {
            imgObject = imgObject.toPNG();
        }

        let md5ID = md5(imgObject);
        if (this.imgMD5IDList[md5ID]) {
            return this.imgPathIDList[this.imgMD5IDList[md5ID]]
        }

        ext = (ext && this.type[ext.toLowerCase().replace(/^\./, '')]) || '.png';

        let imageName = imgName || require('moment')().format('YYYYMMDDhhmmssSSS');
        let count = 0;
        let imageAbsolutePath = path.join(this.imgBasePath, this.fileName, imageName + ext);
        do {
            if (count > 0)
                imageAbsolutePath = path.join(this.imgBasePath, this.fileName, imageName + count + ext);
            count += 1;
            if (count > 50) {
                imageAbsolutePath = path.join(this.imgBasePath, this.fileName, imageName + require('moment')().format('YYYYMMDDhhmmssSSS') + ext);
                break;
            }
        } while (fs.existsSync(imageAbsolutePath));
        mkdirsSync(path.dirname(imageAbsolutePath));
        fs.writeFileSync(imageAbsolutePath, imgObject);
        return this.getImageOfPath(imageAbsolutePath, md5ID)
    }

    updateImgage(imgName, newImgName) {
        this.updateDictionary(imgName + '$', newImgName)
    }

    updateFile(fileName) {
        this.updateDictionary('/' + this.filename + '/', '/' + fileName + '/')
        this.filename = fileName;
    }

    updateDictionary(oldStr, newStr) {
        if (this.imgPathIDList.hasOwnProperty()) {
            this.imgPathIDList = JSON.parse(JSON.stringify(this.imgPathIDList).replace(new RegExp(oldStr, 'g'), newStr));
            if (this.imgMD5IDList.hasOwnProperty())
                this.imgMD5IDList = JSON.parse(JSON.stringify(this.imgMD5IDList).replace(new RegExp(oldStr, 'g'), newStr));
        }
    }
}

module.exports = ImgManager;