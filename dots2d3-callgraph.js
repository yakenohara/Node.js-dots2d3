{/* <License>------------------------------------------------------------
 Copyright (c) 2020 Shinnosuke Yakenohara
 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.
 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.
 You should have received a copy of the GNU General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>
-----------------------------------------------------------</License> */}

(function () {

    // <settings>-----------------------------------------------------------------------

    var str_prefixOfResultFileName = 'callgraph_all';

    // ----------------------------------------------------------------------</settings>

    // Require
    var obj_fileSystem = require('fs');
    var obj_path = require('path');

    // <cation!>
    // `npm install dotparser`
    // https://github.com/anvaka/dotparser
    // </caution>
    var parse = require('dotparser');


    var str_usage = 
    `# Usage

    \`\`\`
    ${obj_path.basename(process.argv[1])} directory [outpath]
    \`\`\`

    ## Required argment

    - \`directory\`
    Directory where DOT file(s) that representing call graph is stored.

    ## Options

    - \`outpath\`
    Path to save the analysis result.
    If not specified, the result will be saved in the directory where DOT file(s) is stored.`;

    var int_numOfWrn = 0;

    // <Check argument>-----------------------------------------------------------------

    console.log('[LOG] ' + 'Checking argument(s)...');

    // 入力 dot file path check
    var str_dotFileDir = process.argv[2];

    if(str_dotFileDir === undefined){ // ディレクトリ指定が無い場合
        console.error('[ERR] ' + 'Argument not specified. check the usage.');
        console.log('\n' + str_usage);
        return;
    }

    try{ //パスチェック
        var obj_statOfDotFileDir = obj_fileSystem.statSync(str_dotFileDir);
    }catch(error){
        if (error.code === 'ENOENT') { // no such file or directory
            console.error('[ERR] ' + '"' + str_dotFileDir + '" No such file or directory');
        }else{ // unkown error
            console.error('[ERR] ' + error);
        }
        return;
    }

    if(!obj_statOfDotFileDir.isDirectory()){ // directory ではない場合
        console.error('[ERR] ' + '"' + str_dotFileDir + '" is not Directory.');
        return;
    }

    var str_dotFileDirAbs = obj_path.resolve(str_dotFileDir);
    console.log('[LOG] ' + 'INPUT  : "' + str_dotFileDirAbs + '"');

    // 出力 file path check

    var str_outFilePath = process.argv[3];
    var str_analysisResultFilePath = '';
    if(str_outFilePath === undefined){ // 出力先ファイルパス指定がない場合

        // 出力先ファイルパス生成
        var int_suffix = 0;
        while(true){
            str_analysisResultFilePath =
                str_dotFileDirAbs +
                '\\' +
                str_prefixOfResultFileName +
                (int_suffix == 0 ? '' : (' (' + String(int_suffix) + ')')) +
                '.json'
            ;

            try{ //パスチェック
                var obj_statOfResultPath = obj_fileSystem.statSync(str_analysisResultFilePath);
                if(!obj_statOfResultPath.isFile()){//出力先ファイルパスは存在しない場合
                    break;
                }

            }catch(error){
                if (error.code === 'ENOENT') { // no such file or directory
                    break;

                }else{ // unkown error
                    console.error('[ERR] ' + error);
                    return;
                }
            }

            //出力先ファイルパスはすでに存在する場合
            int_suffix++;
        }
        
    }else{ // 出力先ファイルパス指定がある場合
        
        try{ //パスチェック
            str_analysisResultFilePath = obj_path.resolve(str_outFilePath);
            var obj_statOfResultPath = obj_fileSystem.statSync(str_analysisResultFilePath);
            if(obj_statOfResultPath.isFile()){//出力先ファイルパスはすでに存在する場合
                console.error('[ERR] ' + 'Specified output file "' + str_analysisResultFilePath + '" is already existed.');
                return;
            }

        }catch(error){
            if (error.code === 'ENOENT') { // no such file or directory
                //nothing to do

            }else{ // unkown error
                console.error('[ERR] ' + error);
                return;
            }
        }
    }

    console.log('[LOG] ' + 'OUTPUT : "' + str_analysisResultFilePath + '"');

    // ----------------------------------------------------------------</Check argument>

    console.log('');

    // <making dot file list to parse>--------------------------------------------------

    console.log('[LOG] ' + 'Analyzing...');

    var obj_fileList = obj_fileSystem.readdirSync(str_dotFileDirAbs);
    var obj_dotPaths = [];

    for(var int_idxOfFileList = 0 ; int_idxOfFileList < obj_fileList.length ; int_idxOfFileList++){
        var str_fullPath = str_dotFileDirAbs + '\\' + obj_fileList[int_idxOfFileList];
        
        if(
            (obj_fileSystem.statSync(str_fullPath).isFile()) && // ファイルを表す
            (/.+_cgraph\.dot$/.test(str_fullPath))              // call graph を表す dot ファイル
        ){
            obj_dotPaths.push(str_dotFileDirAbs + '\\' + obj_fileList[int_idxOfFileList]);
        }
        
    }

    if(obj_dotPaths.length == 0){ // call graph を表す dot ファイルがなかった場合
        console.warn('[ERR] ' + 'No valid call graph dot file found.');
        return;
    }

    // -------------------------------------------------</making dot file list to parse>

    var obj_margedDatasAndLinks = {
        'datas':[],
        'links':[]
    };

    // <parsing dot files>--------------------------------------------------------------

    for (var int_idxOfDotPaths = 0 ; int_idxOfDotPaths < obj_dotPaths.length ; int_idxOfDotPaths++){

        console.log('[LOG] ' + '"' + obj_dotPaths[int_idxOfDotPaths] + '"');

        var str_dotContent = obj_fileSystem.readFileSync(obj_dotPaths[int_idxOfDotPaths], 'utf-8');
        var obj_ast = parse(str_dotContent);

        var obj_idToLabel = {};
        var obj_idLinks = [];

        // "type": "digraph" を検索する loop
        for (var int_idxOfDigraph = 0 ; int_idxOfDigraph < obj_ast.length ; int_idxOfDigraph++){
            
            var obj_digraph = obj_ast[int_idxOfDigraph];

            if(obj_digraph['type'] === 'digraph'){

                // "type": "node_stmt" or "edge_stmt" を検索する loop
                for(var int_idxOfChildren = 0 ; int_idxOfChildren < obj_digraph['children'].length ; int_idxOfChildren++){

                    var obj_childOfDigraph = obj_digraph['children'][int_idxOfChildren];

                    switch(obj_childOfDigraph['type']){

                        case 'node_stmt':
                            // console.log('[LOG] ' + JSON.stringify(obj_childOfDigraph['node_id']));

                            // label の検索
                            var obj_attrs = obj_childOfDigraph['attr_list'];
                            for(var int_idxOfAttrs = 0 ; int_idxOfAttrs < obj_attrs.length ; int_idxOfAttrs++){
                                var obj_attr = obj_attrs[int_idxOfAttrs];
                                
                                if(obj_attr['id'] === 'label'){ // label attribute が見つかった場合
                                    var str_labelName = obj_attr['eq'];

                                    // escape sequence の削除
                                    str_labelName = str_labelName.replace(/\\\\/g,''); // `\\` の削除
                                    str_labelName = str_labelName.replace(/\\n/g,''); // `\n` の削除
                                    str_labelName = str_labelName.replace(/\\l/g,''); // `\l` の削除
                                    str_labelName = str_labelName.replace(/\\r/g,''); // `\r` の削除

                                    var obj_unkownEscs = str_labelName.match(/\\./g); //削除しきれない esc sequence の検索

                                    if(obj_unkownEscs !== null){ //削除しきれない esc sequence がある場合
                                        console.warn('[WRN] ' + 'Knkown escape sequence `' + obj_unkownEscs.toString() + '` defined in following label.');
                                        console.warn('[WRN] ' + obj_attr['eq']);
                                        int_numOfWrn++;
                                    }

                                    //重複チェックループ
                                    var obj_keys = Object.keys(obj_idToLabel);
                                    var bool_alreadyDefined = false;
                                    for(var int_idxOfKeys = 0 ; int_idxOfKeys < obj_keys.length ; int_idxOfKeys++){
                                        if(obj_idToLabel[obj_keys[int_idxOfKeys]] === str_labelName){ // 定義済み id が存在する場合
                                            console.warn('[WRN] ' + 'label:`' + str_labelName + '` is already existed in this file. Duplicate definition found in following object.');
                                            console.warn('[WRN] ' + JSON.stringify(obj_childOfDigraph) );
                                            int_numOfWrn++;
                                            bool_alreadyDefined = true;
                                            break;
                                        }
                                    }
                                    
                                    if(!bool_alreadyDefined){ // 定義済み id ではない場合
                                        obj_idToLabel[obj_childOfDigraph['node_id']['id']] = str_labelName;
                                    }

                                    break;
                                }
                            }

                            break;

                        case 'edge_stmt':
                            var obj_edges = obj_childOfDigraph['edge_list'];
                            for(var int_idxOfEdges = 0 ; int_idxOfEdges < (obj_edges.length-1) ; int_idxOfEdges++){

                                // <caution!> '->' か '--' かは判定できない </caution!>

                                var obj_sourceEdge = obj_edges[int_idxOfEdges];
                                var obj_targetEdge = obj_edges[int_idxOfEdges+1];
                                
                                var obj_link = {
                                    'source':obj_sourceEdge['id'],
                                    'target':obj_targetEdge['id']
                                };

                                // console.log('[LOG] ' + JSON.stringify(obj_link));

                                //定義済み link かどうかチェック
                                var bool_alreadyDefined = false;
                                for(var int_idxOfIdLinks = 0 ; int_idxOfIdLinks < obj_idLinks.length ; int_idxOfIdLinks++){
                                    var obj_tmp = obj_idLinks[int_idxOfIdLinks];
                                    if( //すでに link が定義されている場合
                                        (obj_tmp['source'] === obj_link['source']) &&
                                        (obj_tmp['target'] === obj_link['target'])
                                    ){
                                        console.warn('[WRN] ' + 'edge:`' + obj_link['source'] + '` -> `' + obj_link['target'] + '` is already existed in this file. Duplicate definition found in following object.');
                                        console.warn('[WRN] ' + JSON.stringify(obj_childOfDigraph) );
                                        int_numOfWrn++;
                                        bool_alreadyDefined = true;
                                        break;
                                    }
                                }

                                if(!bool_alreadyDefined){ //定義済み link ではない場合
                                    obj_idLinks.push(obj_link); //追加
                                }
                            }
                            break;

                        default: // `node_stmt` でも `edge_stmt` でもない object
                            //nothing to do
                            break;
                            
                    }
                }
                obj_digraph['children']

            }else{
                console.warn('[WRN] ' + 'Unkown graph type `' + obj_digraph['type'] + '` is defined in this file.');
                int_numOfWrn++;
            }
        }

        // console.log('[LOG] ' + JSON.stringify(obj_idToLabel, undefined, 4));
        // console.log('[LOG] ' + JSON.stringify(obj_idLinks, undefined, 4));

        // data 追加
        obj_keys = Object.keys(obj_idToLabel);

        Object.keys(obj_idToLabel).forEach(function(str_idName){
            var str_keyName = obj_idToLabel[str_idName];
            var obj_data = {
                'key':str_keyName,
                'type':'text',
                'text':{
                    'text_content':str_keyName
                }
            };

            // data 重複チェック
            var bool_alreadyDefined = false;
            for(var int_idxOfDatas = 0 ; int_idxOfDatas < obj_margedDatasAndLinks['datas'].length ; int_idxOfDatas++){
                var obj_tmp = obj_margedDatasAndLinks['datas'][int_idxOfDatas];
                if(obj_tmp['key'] === obj_data['key']){ //定義済み key の場合
                    bool_alreadyDefined = true;
                    break;
                }
            }
            if(!bool_alreadyDefined){ // 定義済み data ではない場合
                obj_margedDatasAndLinks['datas'].push(obj_data); // data 追加
            }
        })

        // link 追加
        for(var int_idxOfIdLinks = 0 ; int_idxOfIdLinks < obj_idLinks.length ; int_idxOfIdLinks++){
            var str_sourceKey = obj_idToLabel[obj_idLinks[int_idxOfIdLinks]['source']];
            var str_targetKey = obj_idToLabel[obj_idLinks[int_idxOfIdLinks]['target']];

            var obj_link = {
                'source':str_sourceKey,
                'target':str_targetKey,
                'type':'line',
                'line':{
                    "marker_end": "arrow1"
                }
            }

            // link 重複チェック
            var bool_alreadyDefined = false;
            for(var int_idxOfLinks = 0 ; int_idxOfLinks < obj_margedDatasAndLinks['links'].length ; int_idxOfLinks++){
                var obj_tmp = obj_margedDatasAndLinks['links'][int_idxOfLinks];
                if( // 定義済み link の場合
                    (obj_tmp['source'] === obj_link['source']) &&
                    (obj_tmp['target'] === obj_link['target'])
                ){
                    bool_alreadyDefined = true;
                    break;
                }
            }
            if(!bool_alreadyDefined){ // 定義済み link ではない場合
                obj_margedDatasAndLinks['links'].push(obj_link); // link 追加
            }
        }
    }
    // -------------------------------------------------------------</parsing dot files>

    // console.log('[LOG] ' + JSON.stringify(obj_margedDatasAndLinks, undefined, 4));

    obj_fileSystem.writeFileSync(str_analysisResultFilePath, JSON.stringify(obj_margedDatasAndLinks, undefined, 4));

    console.log('');

    console.log('[LOG] ' + 'done!');

    console.log('');

    console.log('[LOG] ' + '----------RESULT-----------');
    console.log('[LOG] ' + 'NUMBER OF WARNINGS : ' + String(int_numOfWrn));
    console.log('[LOG] ' + 'OUTPUT : "' + str_analysisResultFilePath + '"');

}());
