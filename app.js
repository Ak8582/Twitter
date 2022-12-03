const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();

app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
let database = null;

const initializeDnAndServer = async () => {
  try {
    database = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log(`Server is running on http://localhost:3000`);
    });
  } catch (error) {
    console.log(`Database Error is ${error}`);
    process.exit(1);
  }
};

initializeDnAndServer();

//api 1

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  //encrypt password
  const hashedPassword = await bcrypt.hash(password, 10);
  // check if user exists
  const checkUserQuery = `select username from user where username = '${username}';`;
  const checkUserResponse = await database.get(checkUserQuery);
  if (checkUserResponse === undefined) {
    const createUserQuery = `
      insert into user(username,name,password,gender) 
      values('${username}','${name}','${hashedPassword}','${gender}');`;
    if (password.length > 6) {
      const createUser = await database.run(createUserQuery);
      response.send("User created successfully"); //Scenario 3
    } else {
      response.status(400);
      response.send("Password is too short"); //Scenario 2
    }
  } else {
    response.status(400);
    response.send(`User already exists`); //Scenario 1
  }
});

//api 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  // check user
  const userDetailsQuery = `select * from user where username = '${username}';`;
  const userDetails = await database.get(userDetailsQuery);
  if (userDetails !== undefined) {
    const isPasswordValid = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordValid) {
      //get JWT Token
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "sairam_key");
      response.send({ jwtToken }); //Scenario 3
    } else {
      response.status(400);
      response.send(`Invalid password`); //Scenario 2
    }
  } else {
    response.status(400);
    response.send("Invalid user"); //Scenario 1
  }
});

//Authentication Token

function authenticationToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers.authorization;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "sairam_key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send(`Invalid JWT Token`); // Scenario 1
      } else {
        console.log(payload);
        next(); //Scenario 2
      }
    });
  } else {
    response.status(401);
    response.send(`Invalid JWT Token`); //Scenario 1
  }
}

const getSpecificUserDetailsFromDB = async (username) => {
  const queryToGetSpecificUserDetails = `
    SELECT
        *
    FROM
        user
    WHERE
        username = '${username}';
    `;
  const specificUserDetails = await database.get(queryToGetSpecificUserDetails);
  return specificUserDetails;
};

const getListOfFollowingUserIdObjectsForSpecificUser = async (username) => {
  const specificUserDetails = await getSpecificUserDetailsFromDB(username);
  const { user_id } = specificUserDetails;
  const queryToFetchFollowingUserIDs = `
                SELECT
                    following_user_id
                FROM
                    follower
                WHERE
                    follower_user_id = ${user_id};
                `;
  const listOfFollowingUserIdObjects = await database.all(
    queryToFetchFollowingUserIDs
  );
  return listOfFollowingUserIdObjects;
};

//api3
const convertStateDbObject1 = (objectItem) => {
  return {
    username: objectItem.username,
    tweet: objectItem.tweet,
    dateTime: objectItem.date_time,
  };
};
app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request.query;
    const listOfFollowingUserIdObjects = await getListOfFollowingUserIdObjectsForSpecificUser(
      username
    );
    const listOfFollowingUserIds = listOfFollowingUserIdObjects.map(
      (currentFollowingUserIdObject) =>
        currentFollowingUserIdObject.following_user_id.toString()
    );
    const followingUserIdsString = listOfFollowingUserIds.join(", ");
    const getUserQuery = `SELECT
            user.username AS username,
            tweet.tweet AS tweet,
            tweet.date_time AS date_time
          FROM 
            tweet
          INNER JOIN 
            user
          ON
            tweet.user_id = user.user_id
          WHERE
            tweet.user_id IN (${followingUserIdsString})
          ORDER BY
            tweet.date_time DESC
          LIMIT 4;`;
    const getUserQueryResponse = await database.all(getUserQuery);
    response.send(
      getUserQueryResponse.map((eachUser) => convertStateDbObject1(eachUser))
    );
  }
);

//api4
const convertStateDbObject2 = (objectItem) => {
  return {
    name: objectItem.name,
  };
};
app.get("/user/following/", authenticationToken, async (request, response) => {
  const getNameQuery = `select name from user natural join follower`;
  const getNameQueryResponse = await database.all(getNameQuery);
  response.send(
    getNameQueryResponse.map((eachName) => convertStateDbObject2(eachName))
  );
});

//api5

const convertStateDbObject3 = (objectItem) => {
  return {
    name: objectItem.name,
  };
};
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const getFollowerNameQuery = `select name from user natural join follower`;
  const getFollowerNameQueryResponse = await database.all(getFollowerNameQuery);
  response.send(
    getFollowerNameQueryResponse.map((eachName) =>
      convertStateDbObject3(eachName)
    )
  );
});

//api6

const convertStateDbObject4 = (objectItem) => {
  return {
    tweet: objectItem.tweet,
    likes: objectItem.like_id,
    replies: objectItem.reply,
    dateTime: objectItem.date_time,
  };
};
app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { followingId } = request.params;
  const getlikesrepliesQuery = `select * from (Tweet inner join Reply on Tweet.tweet_id = Reply.tweet_id) AS T
  inner join Like on T.tweet_id =Like.tweet_id`;
  const getlikesrepliesQueryResponse = await database.all(getlikesrepliesQuery);
  if (followingId === undefined) {
    response.status(401);
    response.send(`Invalid Request`);
  } else {
    response.send(
      getlikesrepliesQueryResponse.map((eachTweet) =>
        convertStateDbObject4(eachTweet)
      )
    );
  }
});

//api7
const convertStateDbObject5 = (objectItem) => {
  return {
    likes: objectItem.username,
  };
};
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const { likeId } = request.params;
    const getLikesQuery = `select username from (user inner join tweet on user.user_id =tweet.user_id) as T
    inner join like on T.tweet_id = like.tweet_id`;
    const getLikesQueryResponse = await database.all(getLikesQuery);
    if (likeId === undefined) {
      response.status(401);
      response.send(`Invalid Request`);
    } else {
      response.send(
        getLikesQueryResponse.map((eachTweet) =>
          convertStateDbObject5(eachTweet)
        )
      );
    }
  }
);

//api8

const convertStateDbObject8 = (objectItem) => {
  return {
    replies: [objectItem.name, objectItem.reply],
  };
};
app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    const { replyId } = request.params;
    const { name, reply } = request.query;
    const getRepliesQuery = `select name,reply from (Tweet inner join Reply on Tweet.tweet_id =Reply.tweet_id) as T inner join user on user.user_id = T.user_id`;
    const getRepliesQueryResponse = await database.all(getRepliesQuery);
    if (replyId === undefined) {
      response.status(401);
      response.send(`Invalid Request`);
    } else {
      response.send(
        getRepliesQueryResponse.map((eachTweet) =>
          convertStateDbObject8(eachTweet)
        )
      );
    }
  }
);

//api9

const convertStateDbObject = (objectItem) => {
  return {
    tweet: objectItem.tweet,
    likes: objectItem.username,
    replies: objectItem.reply,
    dateTime: objectItem.date_time,
  };
};
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweetId } = request.params;
  const getTweetQuery = `select * from (Tweet inner join Reply on Tweet.tweet_id = Reply.tweet_id) AS T
  inner join user on T.user_id =user.user_id`;
  const getTweetQueryResponse = await database.all(getTweetQuery);
  response.send(
    getTweetQueryResponse.map((eachTweet) => convertStateDbObject(eachTweet))
  );
});

//api10

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweet } = request.body;
  const createTweetQuery = `insert into Tweet(tweet) 
  values('${tweet}');`;
  const createTweetQueryResponse = await database.run(createTweetQuery);
  response.send(`Created a Tweet`);
});

//api11

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { userId, tweetId } = request.params;
    const deleteTweetQuery = `delete from tweet where tweet_id = ${tweetId};`;
    const deleteDistrict = await database.run(deleteTweetQuery);
    if (tweetId === undefined) {
      response.status(401);
      response.send(`Invalid Request`);
    } else {
      response.send(`Tweet Removed`);
    }
  }
);

module.exports = app;
