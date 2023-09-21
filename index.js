var express 	= require( 'express' ),
	app 		= express(),
	fs 			= require( 'fs' ),
	multer 		= require( 'multer' ),
	http 		= require( 'https' ),
	server 		= require( 'http' ).createServer( app ),	
	io 			= require( 'socket.io' )( server ),
	port 		= process.env.PORT || 8080,
	mammoth 	= require( 'mammoth' ),
	connections = [];

const { MongoClient } = require( 'mongodb' ),
	url			= `mongodb+srv://${process.env.MONGODB_LOGIN}:${process.env.MONGODB_PASSWORD}@cluster0.omikn.mongodb.net/documents?retryWrites=true&w=majority`,
	client		= new MongoClient( url ),
	db			= client.db( 'documents' ),
	collection 	= db.collection( 'documents' );
	
var title = null,
	type = null,
	path = null,
	documentText = null;

var storage = multer.diskStorage({
	destination: function ( req, file, callback ) {
		callback( null, './uploads' );
	},
	filename: function ( req, file, callback ) {
		title = file.originalname.split( '.' )[0];
		type = file.originalname.split( '.' )[1];
		path = `${file.fieldname}-${Date.now()}`;
		callback( null, `${path}.${type}` );
	}
});

var upload = multer({ storage : storage }).single( 'file' );

var update = function () {
	return new Promise(( resolve, reject ) => {
		client.connect(function ( err, client ) {		 
			if( err ) return console.log( err );
			  
			collection.find().toArray(function ( err, results ) {
				list = [];
				results.forEach( function ( item, i ) {
					list.push( `<div class="file"><p><b><i class="bi bi-file-earmark-word"></i>${item.title}</b></p><div><button onclick="openFile(this)" id="${item.id}" class="waves-effect waves-light btn-small z-depth-2" style="margin: 0 10px;">Открыть</button><button onclick="deleteFile(this)" id="${item.id}" class="waves-effect waves-light btn-small z-depth-2" style="margin: 0 10px;">Удалить</button></div></div><hr/>` )
				});
				client.close();
				resolve( list.join( '' ) );
				io.sockets.emit( 'success', {type: 'update'} );
			});
		});
	});
}

app.get( '/', function ( req, res ) {
	res.writeHead( 200, { 'Content-Type': 'text/html; charset=utf8' });
	fs.createReadStream( './index.html', 'utf8' ).pipe( res );
});


app.post( '/upload', function ( req, res ) {
    upload( req, res, function ( err ) {
        if( err ) {
            return res.end( 'Error uploading file.' );
        }		
		mammoth.convertToHtml({ path: `./uploads/${path}.${type}` })
		.then(function ( result ) {
			documentText = result.value;
			client.connect(function ( err, client ) {				
				let personDocument = {
					"id": path,
					"title": title,
					"text": documentText,
				};
				collection.insertOne( personDocument, function ( err, result ) {				
					client.close();
					res.redirect( '/' );
				});
			});
		})
    });
});
io.sockets.on( 'connection' , function ( socket ) {
	console.log( 'connection' );
	connections.push( socket );
	socket.on( 'disconnect', function( data ) {
		connections.splice( connections.indexOf( socket ), 1);
		console.log( 'disconnect' );
	});
	
	update().then(list => {
		io.sockets.emit( 'update', { list: list } );	
	});
	socket.on( 'save', function ( data ) {
		client.connect(function ( err, client ) {
			if( err ) return console.log( err );
			collection.findOneAndUpdate(
				{ id: data.fileID },
				{ $set: {
					title: data.title,
					text: data.documentText
				}},
				function ( err, result ) {
					client.close();
					io.sockets.emit( 'success', { type: 'save', title: data.title, documentText: data.documentText, fileID: data.fileID, userID: data.userID });
					if ( data.titleOld != data.title ){						
						update().then(list => {
							io.sockets.emit( 'update', { list: list } );
						});
					}
				}
			);
		});
	});
	socket.on( 'delete', function ( data ) {
		client.connect(function ( err, client ) {			    
			if( err ) return console.log( err );	
			collection.deleteOne({id: data.fileID}, function ( err, result ) {
				client.close();
				update().then(list => {
					io.sockets.emit( 'update', { list: list } );	
					io.sockets.emit( 'success', {type: 'delete'} );
				});
			});
		});
	});
	socket.on( 'new', function ( data ) {
		let time = Date.now();
		path = `file-${time}`;
		title = 'Новый документ';
		documentText = "";	
		client.connect(function ( err, client ) {			
			let personDocument = {
				"id": path,
				"title": title,
				"text": documentText,
			};
			collection.insertOne(personDocument, function ( err, result ) {				
				client.close();
				io.sockets.emit( 'new', { fileID: path, title: title, documentText: documentText } );	
				update().then(list => {
					io.sockets.emit( 'update', { list: list } );
					io.sockets.emit( 'success', {type: 'new'} );
				});
			});
		});
	});
	socket.on( 'open', function ( data ) {
		client.connect(function ( err, client ) {			
			if( err ) return console.log( err );			  
			collection.find({id: data.fileID}).toArray(function (err, results) {
				client.close();
				title = results[0].title;
				documentText = results[0].text;
				io.sockets.emit( 'success', {type: 'open', fileID: data.fileID, title: title, documentText: documentText, userID: data.userID} );
			});
		});
	});	
})

server.listen( port, function () {
	console.log( 'Express server listening on port ' + port );
});